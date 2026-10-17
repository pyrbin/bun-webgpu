// Dawn's blob cache as files in one directory, compiled by bun:ffi's cc and handed to Dawn as plain
// function pointers: Dawn calls load and store from its compile worker threads, where no JS may run.
// A file is u32 key length, the canonical key, the value, then a u64 FNV-1a of all before it, so a
// torn, truncated or colliding file is a miss. Its name is the FNV-1a of the canonical key in hex.
// No headers ship with cc, so the few libc and Win32 calls are declared here.

typedef unsigned char u8;
typedef unsigned int u32;
typedef unsigned long long u64;
typedef u64 usize;
typedef struct FILE FILE;

FILE *fopen(const char *, const char *);
usize fread(void *, usize, usize, FILE *);
usize fwrite(const void *, usize, usize, FILE *);
int fseek(FILE *, long, int);
long ftell(FILE *);
int fclose(FILE *);
int remove(const char *);
void *malloc(usize);
void free(void *);
void *memcpy(void *, const void *, usize);

#ifdef _WIN32
unsigned long GetCurrentProcessId(void);
int MoveFileExA(const char *, const char *, unsigned long);
struct _utimbuf;
int _utime(const char *, struct _utimbuf *);
static u64 process_id(void) { return GetCurrentProcessId(); }
static int replace(const char *from, const char *to) { return MoveFileExA(from, to, 1) ? 0 : -1; }
static void touch(const char *path) { _utime(path, 0); }
#else
int getpid(void);
int rename(const char *, const char *);
struct utimbuf;
int utime(const char *, const struct utimbuf *);
static u64 process_id(void) { return (u64)getpid(); }
static int replace(const char *from, const char *to) { return rename(from, to); }
static void touch(const char *path) { utime(path, 0); }
#endif

static u64 fnv(const u8 *p, usize n) {
  u64 h = 0xcbf29ce484222325ull;
  for (usize i = 0; i < n; i++) h = (h ^ p[i]) * 0x100000001b3ull;
  return h;
}

static u64 get64(const u8 *p) {
  u64 v = 0;
  for (int i = 7; i >= 0; i--) v = (v << 8) | p[i];
  return v;
}

static void put64(u8 *p, u64 v) {
  for (int i = 0; i < 8; i++, v >>= 8) p[i] = (u8)v;
}

// Dawn writes some sets in hash-table order, which differs between processes (a shader's binding
// points: a u64 count, then each as u32 group and u32 binding). Every run shaped so (a count of 2
// to 64, then that many distinct pairs of u32 under 2^16) is sorted in place as u64s, which makes
// those keys alike.
// shortcut: a run that only looks like a set loses its order too, so two keys differing just there
// would share an entry; none did across 17,183 measured keys. Drop this once Dawn sorts its sets.
void canonical(u8 *key, usize size) {
  u64 run[64];
  for (usize i = 0; i + 8 <= size; i++) {
    u64 n = get64(key + i);
    if (n < 2 || n > 64 || i + 8 + 8 * n > size) continue;
    int ok = 1;
    for (u64 k = 0; k < n && ok; k++) {
      u64 x = get64(key + i + 8 + 8 * k);
      if ((x & 0xffffffffull) >= 65536 || (x >> 32) >= 65536) ok = 0;
      for (u64 j = 0; j < k && ok; j++)
        if (run[j] == x) ok = 0;
      run[k] = x;
    }
    if (!ok) continue;
    for (u64 k = 1; k < n; k++)
      for (u64 j = k; j > 0 && run[j - 1] > run[j]; j--) {
        u64 t = run[j];
        run[j] = run[j - 1];
        run[j - 1] = t;
      }
    for (u64 k = 0; k < n; k++) put64(key + i + 8 + 8 * k, run[k]);
    i += 8 + 8 * n - 1;
  }
}

// the canonical key in a fresh buffer and the file's path, `<dir><16 hex digits>`; `dir` ends in '/'
static u8 *keyed(const u8 *key, usize size, const char *dir, char *path, usize room) {
  u8 *canon = malloc(size);
  if (canon == 0) return 0;
  memcpy(canon, key, size);
  canonical(canon, size);
  u64 h = fnv(canon, size);
  usize at = 0;
  while (dir[at] != 0 && at + 17 < room) {
    path[at] = dir[at];
    at++;
  }
  for (int i = 15; i >= 0; i--, h >>= 4) path[at + i] = "0123456789abcdef"[h & 15];
  path[at + 16] = 0;
  return canon;
}

#define ROOM 1024

usize blob_load(const void *key, usize keySize, void *value, usize valueSize, void *dir) {
  char path[ROOM];
  u8 *canon = keyed(key, keySize, dir, path, ROOM - 40);
  if (canon == 0) return 0;
  usize got = 0;
  u8 *file = 0;
  FILE *f = fopen(path, "rb");
  if (f == 0) goto done;
  long size = fseek(f, 0, 2) == 0 ? ftell(f) : -1;
  if (size < (long)(4 + keySize + 8) || fseek(f, 0, 0) != 0) goto done;
  file = malloc((usize)size);
  if (file == 0 || fread(file, 1, (usize)size, f) != (usize)size) goto done;
  usize body = (usize)size - 8;
  u32 length = file[0] | file[1] << 8 | file[2] << 16 | (u32)file[3] << 24;
  if (length != keySize || get64(file + body) != fnv(file, body)) goto done;
  for (usize i = 0; i < keySize; i++)
    if (file[4 + i] != canon[i]) goto done;
  usize stored = body - 4 - keySize;
  // Dawn asks the size with no buffer, then again with one of that size
  if (value == 0) {
    got = stored;
  } else if (valueSize == stored) {
    memcpy(value, file + 4 + keySize, stored);
    got = stored;
  }
done:
  if (f != 0) fclose(f);
  free(file);
  free(canon);
  // a hit marks the file used, so a pruner by modification time drops the least recently used
  if (got != 0 && value != 0) touch(path);
  return got;
}

void blob_store(const void *key, usize keySize, const void *value, usize valueSize, void *dir) {
  char path[ROOM];
  char tmp[ROOM + 40];
  u8 *canon = keyed(key, keySize, dir, path, ROOM - 40);
  if (canon == 0) return;
  usize size = 4 + keySize + valueSize + 8;
  u8 *file = malloc(size);
  if (file != 0) {
    file[0] = (u8)keySize;
    file[1] = (u8)(keySize >> 8);
    file[2] = (u8)(keySize >> 16);
    file[3] = (u8)(keySize >> 24);
    memcpy(file + 4, canon, keySize);
    memcpy(file + 4 + keySize, value, valueSize);
    put64(file + size - 8, fnv(file, size - 8));
    // the process id and this call's stack address keep two writers apart; the rename makes a whole
    // file appear at once
    usize at = 0;
    while (path[at] != 0) {
      tmp[at] = path[at];
      at++;
    }
    u64 ids[2] = {process_id(), (u64)(usize)&size};
    for (int k = 0; k < 2; k++) {
      tmp[at++] = '.';
      u64 v = ids[k];
      for (int i = 15; i >= 0; i--, v >>= 4) tmp[at + i] = "0123456789abcdef"[v & 15];
      at += 16;
    }
    tmp[at] = 0;
    FILE *f = fopen(tmp, "wb");
    if (f != 0) {
      int whole = fwrite(file, 1, size, f) == size;
      if (fclose(f) != 0) whole = 0;
      // a failed replace (a reader holds the file open on Windows) drops this store: a later miss stores again
      if (!whole || replace(tmp, path) != 0) remove(tmp);
    }
    free(file);
  }
  free(canon);
}

// the two functions' addresses, for the cache descriptor Dawn reads them from
void blob_functions(u64 *out) {
  out[0] = (u64)(usize)blob_load;
  out[1] = (u64)(usize)blob_store;
}
