#include "movegen.hpp"

#include <cstring>

namespace bg {

uint64_t boardHash(const Board& b) {
  uint64_t w[7] = {0, 0, 0, 0, 0, 0, 0};
  static_assert(sizeof(Board) <= sizeof(w), "board fits in 7 words");
  std::memcpy(w, &b, sizeof(Board));
  uint64_t h = 0x9E3779B97F4A7C15ull;
  for (uint64_t x : w) {
    h ^= x;
    h *= 0xFF51AFD7ED558CCDull;
    h ^= h >> 32;
  }
  return h;
}

namespace {

bool allHome(const Board& b) {
  for (int p = 7; p <= kBar; p++) {
    if (b.me[p] > 0) return false;
  }
  return true;
}

// Destination of moving one checker from `from` with `die`, or -1 if illegal.
int destination(const Board& b, int from, int die) {
  if (b.me[from] == 0) return -1;
  if (b.me[kBar] > 0 && from != kBar) return -1;  // must enter first
  const int dest = from - die;
  if (dest >= 1) {
    return b.opp[kBar - dest] >= 2 ? -1 : dest;  // opponent's point 25 - dest
  }
  if (!allHome(b)) return -1;
  if (dest == 0) return kOff;  // exact bear-off
  for (int p = from + 1; p <= 6; p++) {  // larger die: only from the highest occupied point
    if (b.me[p] > 0) return -1;
  }
  return kOff;
}

void applyStep(Board& b, int from, int to) {
  b.me[from]--;
  if (to == kOff) {
    b.me[kOff]++;
    return;
  }
  uint8_t& opp = b.opp[kBar - to];
  if (opp == 1) {  // hit
    opp = 0;
    b.opp[kBar]++;
  }
  b.me[to]++;
}

// Collects maximal plays, deduplicated by resulting board in a small open-addressing table.
struct Collector {
  std::vector<Play>* out = nullptr;
  std::vector<uint8_t> usesHigher;  // parallel to *out: some ordering of this play starts with the higher die
  std::vector<int32_t> slot;        // index into *out
  std::vector<uint32_t> stamp;      // slot is live iff stamp == current
  std::vector<uint64_t> hashes;     // parallel to *out
  uint32_t current = 0;
  int maxLen = 0;
  int higher = 0;

  void begin(std::vector<Play>& o, int hi) {
    out = &o;
    out->clear();
    usesHigher.clear();
    hashes.clear();
    maxLen = 0;
    higher = hi;
    if (slot.empty()) {
      slot.assign(256, 0);
      stamp.assign(256, 0);
    }
    clearTable();
  }

  void clearTable() {
    if (++current == 0) {  // stamp wrapped: really clear
      std::fill(stamp.begin(), stamp.end(), 0);
      current = 1;
    }
  }

  void insertSlot(int32_t index, uint64_t h) {
    const size_t mask = slot.size() - 1;
    size_t i = h & mask;
    while (stamp[i] == current) i = (i + 1) & mask;
    stamp[i] = current;
    slot[i] = index;
  }

  void grow() {
    slot.assign(slot.size() * 2, 0);
    stamp.assign(stamp.size() * 2, 0);
    current = 1;
    for (size_t k = 0; k < out->size(); k++) insertSlot(static_cast<int32_t>(k), hashes[k]);
  }

  void record(const Play& play, int firstDie) {
    if (play.count < maxLen) return;
    if (play.count > maxLen) {
      maxLen = play.count;
      out->clear();
      usesHigher.clear();
      hashes.clear();
      clearTable();
    }
    const uint8_t hi = firstDie == higher ? 1 : 0;
    const uint64_t h = boardHash(play.result);
    const size_t mask = slot.size() - 1;
    for (size_t i = h & mask; stamp[i] == current; i = (i + 1) & mask) {
      const int32_t k = slot[i];
      if (hashes[k] == h && sameBoard((*out)[k].result, play.result)) {
        usesHigher[k] |= hi;
        return;
      }
    }
    if ((out->size() + 1) * 2 > slot.size()) grow();
    out->push_back(play);
    usesHigher.push_back(hi);
    hashes.push_back(h);
    insertSlot(static_cast<int32_t>(out->size() - 1), h);
  }
};

thread_local Collector collector;

// Depth-first over the dice in `seq`. For doubles, steps must start from the same or a lower
// point than the previous step: every sequence of a double can be reordered that way, so this
// drops duplicate orderings without losing any resulting board (gnubg does the same).
void search(const Board& b, const int* seq, int nseq, bool doubles, int depth, int maxFrom, Play& cur,
            int firstDie) {
  bool moved = false;
  if (depth < nseq) {
    const int die = seq[depth];
    for (int from = maxFrom; from >= 1; from--) {
      const int to = destination(b, from, die);
      if (to < 0) continue;
      moved = true;
      Board next = b;
      applyStep(next, from, to);
      cur.steps[depth] = Step{static_cast<int8_t>(from), static_cast<int8_t>(to)};
      search(next, seq, nseq, doubles, depth + 1, doubles ? from : kBar, cur, depth == 0 ? die : firstDie);
    }
  }
  if (!moved && depth > 0) {
    cur.count = static_cast<uint8_t>(depth);
    cur.result = b;
    collector.record(cur, firstDie);
  }
}

}  // namespace

void legalPlays(const Board& board, int die1, int die2, std::vector<Play>& out) {
  Collector& c = collector;
  c.begin(out, die1 > die2 ? die1 : die2);
  Play cur{};
  if (die1 == die2) {
    const int seq[4] = {die1, die1, die1, die1};
    search(board, seq, 4, true, 0, kBar, cur, 0);
  } else {
    const int a[2] = {die1, die2};
    const int b[2] = {die2, die1};
    search(board, a, 2, false, 0, kBar, cur, 0);
    search(board, b, 2, false, 0, kBar, cur, 0);
  }
  // Only one die of a non-double playable: the higher die if any play can use it.
  if (die1 != die2 && c.maxLen == 1) {
    bool any = false;
    for (uint8_t h : c.usesHigher) any = any || h;
    if (any) {
      size_t w = 0;
      for (size_t k = 0; k < out.size(); k++) {
        if (c.usesHigher[k]) out[w++] = out[k];
      }
      out.resize(w);
    }
  }
}

std::vector<Play> legalPlays(const Board& board, int die1, int die2) {
  std::vector<Play> out;
  legalPlays(board, die1, die2, out);
  return out;
}

}  // namespace bg
