/* true8b.c - YOUR TECH TOP TO BOTTOM
 * Path A: Text/Binary = Order-1/Order-2 + XOR Residual -> true8b
 * Path B: Postings/Keys = Pure Delta -> true8b
 * Multi-block + OpenMP parallel compression
 *
 * gcc -O3 -fopenmp -o true8b true8b.c
 * ./true8b c text     input.bin  output.true8b
 * ./true8b c postings ids.txt    out.true8b
 * ./true8b d          output.true8b restored.bin
 * ./true8b bench
 */

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <time.h>

#ifdef _OPENMP
#include <omp.h>
#endif

#define O1_SIZE     256
#define O2_SIZE     65536
#define BLOCK_SIZE  (64 * 1024)
#define MAGIC       "TRUE8B"
#define VERSION     2

#define FLAG_PATH_A 1
#define FLAG_PATH_B 2

typedef struct {
    uint8_t  o1_pred[O1_SIZE];
    uint16_t o1_freq[O1_SIZE][O1_SIZE];
    uint8_t  o2_pred[O2_SIZE];
    uint16_t o2_freq[O2_SIZE];
    uint8_t  o2_last[O2_SIZE];
    uint8_t  o2_rep[O2_SIZE];
} Model;

static void model_init(Model *m) {
    memset(m, 0, sizeof(*m));
}

static inline uint8_t predict_byte(Model *m, uint8_t b1, uint8_t b2, int *has_o2) {
    uint32_t k2 = ((uint32_t)b1 << 8) | b2;
    if (m->o2_freq[k2] > 3) {
        *has_o2 = 1;
        return m->o2_pred[k2];
    }
    *has_o2 = 0;
    return m->o1_pred[b2];
}

static inline void update_model(Model *m, uint8_t b1, uint8_t b2, uint8_t actual) {
    m->o1_freq[b2][actual]++;
    if (m->o1_freq[b2][actual] > m->o1_freq[b2][m->o1_pred[b2]])
        m->o1_pred[b2] = actual;
    if ((m->o1_freq[b2][actual] & 0xFF) == 0) {
        for (int i = 0; i < 256; i++)
            m->o1_freq[b2][i] >>= 1;
    }
    uint32_t k2 = ((uint32_t)b1 << 8) | b2;
    m->o2_freq[k2]++;
    if (m->o2_last[k2] == actual) {
        if (++m->o2_rep[k2] > 2)
            m->o2_pred[k2] = actual;
    } else {
        m->o2_rep[k2] = 0;
        m->o2_last[k2] = actual;
    }
    if (m->o2_freq[k2] == 1)
        m->o2_pred[k2] = actual;
    if (m->o2_freq[k2] > 10000)
        m->o2_freq[k2] = 5000;
}

typedef struct {
    uint8_t *buf;
    size_t   cap, pos;
    uint32_t bitbuf;
    int      bits;
} BitWriter;

typedef struct {
    const uint8_t *buf;
    size_t         len, pos;
    uint32_t       bitbuf;
    int            bits;
} BitReader;

static void bw_init(BitWriter *w, size_t cap) {
    w->buf = (uint8_t *)malloc(cap);
    w->cap = cap;
    w->pos = 0;
    w->bitbuf = 0;
    w->bits = 0;
}

static void bw_write_bits(BitWriter *w, uint32_t v, int n) {
    w->bitbuf = (w->bitbuf << n) | (v & ((1u << n) - 1));
    w->bits += n;
    while (w->bits >= 8) {
        w->bits -= 8;
        if (w->pos >= w->cap) {
            w->cap *= 2;
            w->buf = (uint8_t *)realloc(w->buf, w->cap);
        }
        w->buf[w->pos++] = (uint8_t)((w->bitbuf >> w->bits) & 0xFF);
    }
}

static void bw_flush(BitWriter *w) {
    if (w->bits)
        bw_write_bits(w, 0, 8 - w->bits);
}

static void br_init(BitReader *r, const uint8_t *buf, size_t len) {
    r->buf = buf;
    r->len = len;
    r->pos = 0;
    r->bitbuf = 0;
    r->bits = 0;
}

static uint32_t br_read_bits(BitReader *r, int n) {
    while (r->bits < n) {
        uint32_t b = (r->pos < r->len) ? r->buf[r->pos++] : 0;
        r->bitbuf = (r->bitbuf << 8) | b;
        r->bits += 8;
    }
    r->bits -= n;
    return (r->bitbuf >> r->bits) & ((1u << n) - 1);
}

static size_t true8b_encode_block(const uint8_t *in, size_t n, uint8_t **out) {
    BitWriter w;
    bw_init(&w, n + 1024);
    for (size_t i = 0; i < n; i++) {
        uint8_t v = in[i];
        if (v == 0) {
            bw_write_bits(&w, 0, 1);
        } else if (v < 16) {
            bw_write_bits(&w, 2, 2);
            bw_write_bits(&w, v, 4);
        } else {
            bw_write_bits(&w, 3, 2);
            bw_write_bits(&w, v, 8);
        }
    }
    bw_flush(&w);
    *out = w.buf;
    return w.pos;
}

static void true8b_decode_block(const uint8_t *in, size_t in_len,
                                uint8_t *out, size_t out_len) {
    BitReader r;
    br_init(&r, in, in_len);
    for (size_t i = 0; i < out_len; i++) {
        uint32_t b0 = br_read_bits(&r, 1);
        if (b0 == 0) {
            out[i] = 0;
        } else {
            uint32_t b1 = br_read_bits(&r, 1);
            if (b1 == 0)
                out[i] = (uint8_t)br_read_bits(&r, 4);
            else
                out[i] = (uint8_t)br_read_bits(&r, 8);
        }
    }
}

static size_t pathA_compress_block(const uint8_t *data, size_t len, uint8_t **out) {
    Model m;
    model_init(&m);
    uint8_t *residuals = (uint8_t *)malloc(len);
    uint8_t b1 = 0, b2 = 0;
    for (size_t i = 0; i < len; i++) {
        int has_o2;
        uint8_t pred = predict_byte(&m, b1, b2, &has_o2);
        residuals[i] = data[i] ^ pred;
        update_model(&m, b1, b2, data[i]);
        b1 = b2;
        b2 = data[i];
    }
    size_t out_len = true8b_encode_block(residuals, len, out);
    free(residuals);
    return out_len;
}

static void pathA_decompress_block(const uint8_t *comp, size_t comp_len,
                                   uint8_t *out, size_t orig_len) {
    Model m;
    model_init(&m);
    uint8_t *residuals = (uint8_t *)malloc(orig_len);
    true8b_decode_block(comp, comp_len, residuals, orig_len);
    uint8_t b1 = 0, b2 = 0;
    for (size_t i = 0; i < orig_len; i++) {
        int has_o2;
        uint8_t pred = predict_byte(&m, b1, b2, &has_o2);
        out[i] = residuals[i] ^ pred;
        update_model(&m, b1, b2, out[i]);
        b1 = b2;
        b2 = out[i];
    }
    free(residuals);
}

static size_t pathB_compress_u32(const uint32_t *ids, size_t n, uint8_t **out) {
    uint8_t *deltas_raw = (uint8_t *)malloc(n * 5 + 16);
    size_t p = 0;
    uint32_t prev = 0;
    for (size_t i = 0; i < n; i++) {
        uint32_t d = ids[i] - prev;
        prev = ids[i];
        while (d >= 0x80) {
            deltas_raw[p++] = (uint8_t)((d & 0x7F) | 0x80);
            d >>= 7;
        }
        deltas_raw[p++] = (uint8_t)d;
    }
    size_t out_len = true8b_encode_block(deltas_raw, p, out);
    free(deltas_raw);
    return out_len;
}

typedef struct {
    uint8_t *payload;
    uint32_t orig_len;
    uint32_t comp_len;
} BlockResult;

static int pathA_compress_parallel(const uint8_t *data, size_t len,
                                   size_t block_size,
                                   BlockResult **blocks_out, uint32_t *nblocks_out) {
    uint32_t nblocks = (uint32_t)((len + block_size - 1) / block_size);
    if (nblocks == 0) nblocks = 1;
    BlockResult *blocks = (BlockResult *)calloc(nblocks, sizeof(BlockResult));

    #pragma omp parallel for schedule(dynamic)
    for (uint32_t b = 0; b < nblocks; b++) {
        size_t start = (size_t)b * block_size;
        size_t blen  = (start + block_size <= len) ? block_size : (len - start);
        uint8_t *payload = NULL;
        size_t plen = pathA_compress_block(data + start, blen, &payload);
        blocks[b].payload  = payload;
        blocks[b].orig_len = (uint32_t)blen;
        blocks[b].comp_len = (uint32_t)plen;
    }

    *blocks_out = blocks;
    *nblocks_out = nblocks;
    return 0;
}

static int write_multiblock(FILE *fp, uint8_t flags, uint64_t orig_total,
                            BlockResult *blocks, uint32_t nblocks) {
    fwrite(MAGIC, 1, 6, fp);
    uint8_t ver = VERSION;
    fwrite(&ver, 1, 1, fp);
    fwrite(&flags, 1, 1, fp);
    fwrite(&nblocks, 4, 1, fp);
    fwrite(&orig_total, 8, 1, fp);

    for (uint32_t i = 0; i < nblocks; i++) {
        fwrite(&blocks[i].orig_len, 4, 1, fp);
        fwrite(&blocks[i].comp_len, 4, 1, fp);
        fwrite(blocks[i].payload, 1, blocks[i].comp_len, fp);
    }
    return 0;
}

static int read_multiblock(FILE *fp, uint8_t *flags, uint64_t *orig_total,
                           BlockResult **blocks_out, uint32_t *nblocks_out) {
    char magic[7] = {0};
    if (fread(magic, 1, 6, fp) != 6 || memcmp(magic, MAGIC, 6) != 0) {
        fprintf(stderr, "bad magic\n");
        return -1;
    }
    uint8_t ver;
    if (fread(&ver, 1, 1, fp) != 1 || ver != VERSION) {
        fprintf(stderr, "bad version %u (need %u)\n", ver, VERSION);
        return -1;
    }
    if (fread(flags, 1, 1, fp) != 1) return -1;
    uint32_t nblocks;
    if (fread(&nblocks, 4, 1, fp) != 1) return -1;
    if (fread(orig_total, 8, 1, fp) != 1) return -1;

    BlockResult *blocks = (BlockResult *)calloc(nblocks, sizeof(BlockResult));
    for (uint32_t i = 0; i < nblocks; i++) {
        if (fread(&blocks[i].orig_len, 4, 1, fp) != 1) goto fail;
        if (fread(&blocks[i].comp_len, 4, 1, fp) != 1) goto fail;
        blocks[i].payload = (uint8_t *)malloc(blocks[i].comp_len);
        if (fread(blocks[i].payload, 1, blocks[i].comp_len, fp) != blocks[i].comp_len)
            goto fail;
    }
    *blocks_out = blocks;
    *nblocks_out = nblocks;
    return 0;
fail:
    for (uint32_t i = 0; i < nblocks; i++) free(blocks[i].payload);
    free(blocks);
    return -1;
}

static int cmd_compress_text(const char *inpath, const char *outpath) {
    FILE *f = fopen(inpath, "rb");
    if (!f) { perror(inpath); return 1; }
    fseek(f, 0, SEEK_END);
    long len = ftell(f);
    fseek(f, 0, SEEK_SET);
    uint8_t *data = (uint8_t *)malloc((size_t)len);
    if (fread(data, 1, (size_t)len, f) != (size_t)len) {
        fclose(f); free(data); return 1;
    }
    fclose(f);

    BlockResult *blocks = NULL;
    uint32_t nblocks = 0;
    clock_t t0 = clock();
    pathA_compress_parallel(data, (size_t)len, BLOCK_SIZE, &blocks, &nblocks);
    double te = (double)(clock() - t0) / CLOCKS_PER_SEC;

    FILE *o = fopen(outpath, "wb");
    if (!o) { perror(outpath); free(data); return 1; }
    write_multiblock(o, FLAG_PATH_A, (uint64_t)len, blocks, nblocks);
    fclose(o);

    size_t total_comp = 0;
    for (uint32_t i = 0; i < nblocks; i++)
        total_comp += blocks[i].comp_len;

    printf("[PATH A multi-block] %ld -> %zu bytes (%.2f%%)  %u blocks  %.1f ms\n",
           len, total_comp + 20 + nblocks * 8,
           100.0 * (total_comp + 20 + nblocks * 8) / len,
           nblocks, te * 1000);

    for (uint32_t i = 0; i < nblocks; i++) free(blocks[i].payload);
    free(blocks);
    free(data);
    return 0;
}

static int cmd_compress_postings(const char *inpath, const char *outpath) {
    FILE *f = fopen(inpath, "rb");
    if (!f) { perror(inpath); return 1; }
    fseek(f, 0, SEEK_END);
    size_t len = (size_t)ftell(f);
    fseek(f, 0, SEEK_SET);
    uint8_t *data = (uint8_t *)malloc(len);
    fread(data, 1, len, f);
    fclose(f);

    uint32_t *ids = (uint32_t *)malloc(len * sizeof(uint32_t));
    size_t n = 0;
    char *p = (char *)data, *end = p + len;
    while (p < end) {
        ids[n++] = (uint32_t)atoi(p);
        while (p < end && *p != '\n') p++;
        if (p < end) p++;
    }

    uint8_t *out = NULL;
    size_t out_len = pathB_compress_u32(ids, n, &out);

    BlockResult br = { out, (uint32_t)n, (uint32_t)out_len };
    FILE *o = fopen(outpath, "wb");
    write_multiblock(o, FLAG_PATH_B, (uint64_t)n, &br, 1);
    fclose(o);

    printf("[PATH B] %zu ids -> %zu bytes (%.2f b/id)\n",
           n, out_len + 28, 8.0 * (out_len + 28) / n);
    free(data); free(ids); free(out);
    return 0;
}

static int cmd_decompress(const char *inpath, const char *outpath) {
    FILE *f = fopen(inpath, "rb");
    if (!f) { perror(inpath); return 1; }

    uint8_t flags;
    uint64_t orig_total;
    BlockResult *blocks = NULL;
    uint32_t nblocks = 0;
    if (read_multiblock(f, &flags, &orig_total, &blocks, &nblocks) != 0) {
        fclose(f);
        return 1;
    }
    fclose(f);

    FILE *o = fopen(outpath, "wb");
    if (!o) { perror(outpath); return 1; }

    if (flags & FLAG_PATH_A) {
        for (uint32_t i = 0; i < nblocks; i++) {
            uint8_t *out = (uint8_t *)malloc(blocks[i].orig_len);
            pathA_decompress_block(blocks[i].payload, blocks[i].comp_len,
                                   out, blocks[i].orig_len);
            fwrite(out, 1, blocks[i].orig_len, o);
            free(out);
        }
        printf("Path A restored %llu bytes (%u blocks)\n",
               (unsigned long long)orig_total, nblocks);
    } else if (flags & FLAG_PATH_B) {
        fprintf(stderr, "Path B multi-decode not fully wired in this build\n");
    }

    for (uint32_t i = 0; i < nblocks; i++) free(blocks[i].payload);
    free(blocks);
    fclose(o);
    return 0;
}

static int cmd_bench(void) {
    const size_t N = 4 << 20;
    uint8_t *data = (uint8_t *)malloc(N);
    for (size_t i = 0; i < N; i++)
        data[i] = (uint8_t)((i * 17 + (i >> 3) + (i >> 7)) & 0xFF);

    clock_t t0 = clock();
    uint8_t *seq_payload = NULL;
    size_t seq_len = pathA_compress_block(data, N, &seq_payload);
    double t_seq = (double)(clock() - t0) / CLOCKS_PER_SEC;

    BlockResult *blocks = NULL;
    uint32_t nblocks = 0;
    t0 = clock();
    pathA_compress_parallel(data, N, BLOCK_SIZE, &blocks, &nblocks);
    double t_par = (double)(clock() - t0) / CLOCKS_PER_SEC;

    size_t par_total = 0;
    for (uint32_t i = 0; i < nblocks; i++)
        par_total += blocks[i].comp_len;

    uint8_t *restored = (uint8_t *)malloc(blocks[0].orig_len);
    pathA_decompress_block(blocks[0].payload, blocks[0].comp_len,
                           restored, blocks[0].orig_len);
    int ok = memcmp(data, restored, blocks[0].orig_len) == 0;

    printf("=== true8b multi-block parallel (4 MiB) ===\n");
    printf("Block size     : %d bytes\n", BLOCK_SIZE);
    printf("Blocks         : %u\n", nblocks);
    printf("Sequential     : %zu bytes  %.1f ms  (%.1f MB/s)\n",
           seq_len, t_seq * 1000, N / t_seq / 1e6);
    printf("Parallel       : %zu bytes  %.1f ms  (%.1f MB/s)\n",
           par_total, t_par * 1000, N / t_par / 1e6);
    printf("Speedup        : %.2fx\n", t_seq / (t_par > 0 ? t_par : 1e-9));
    printf("First block OK : %s\n", ok ? "YES" : "NO");

#ifdef _OPENMP
    printf("OpenMP threads : %d\n", omp_get_max_threads());
#else
    printf("OpenMP         : not enabled (compile with -fopenmp)\n");
#endif

    free(data); free(seq_payload); free(restored);
    for (uint32_t i = 0; i < nblocks; i++) free(blocks[i].payload);
    free(blocks);
    return ok ? 0 : 1;
}

int main(int argc, char **argv) {
    if (argc < 2) {
        printf("usage: %s c [text|postings] in out | d in out | bench\n", argv[0]);
        return 0;
    }
    if (strcmp(argv[1], "bench") == 0)
        return cmd_bench();
    if (argv[1][0] == 'c' && argc >= 5) {
        if (strcmp(argv[2], "text") == 0)
            return cmd_compress_text(argv[3], argv[4]);
        if (strcmp(argv[2], "postings") == 0)
            return cmd_compress_postings(argv[3], argv[4]);
    }
    if (argv[1][0] == 'd' && argc == 4)
        return cmd_decompress(argv[2], argv[3]);
    fprintf(stderr, "bad arguments\n");
    return 1;
}
