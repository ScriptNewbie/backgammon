#include "movegen.hpp"

#include <string>
#include <unordered_set>

namespace bg {
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

struct Raw {
  Play play;
  int firstDie;
};

// Depth-first over the dice in `seq`. For doubles, steps must start from the same or a lower
// point than the previous step: every sequence of a double can be reordered that way, so this
// drops duplicate orderings without losing any resulting board (gnubg does the same).
void search(const Board& b, const int* seq, int nseq, bool doubles, int depth, int maxFrom,
            Play& cur, int firstDie, std::vector<Raw>& out) {
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
      search(next, seq, nseq, doubles, depth + 1, doubles ? from : kBar, cur,
             depth == 0 ? die : firstDie, out);
    }
  }
  if (!moved) {
    cur.count = static_cast<uint8_t>(depth);
    cur.result = b;
    out.push_back(Raw{cur, firstDie});
  }
}

}  // namespace

std::vector<Play> legalPlays(const Board& board, int die1, int die2) {
  std::vector<Raw> raw;
  Play cur{};
  if (die1 == die2) {
    const int seq[4] = {die1, die1, die1, die1};
    search(board, seq, 4, true, 0, kBar, cur, 0, raw);
  } else {
    const int a[2] = {die1, die2};
    const int b[2] = {die2, die1};
    search(board, a, 2, false, 0, kBar, cur, 0, raw);
    search(board, b, 2, false, 0, kBar, cur, 0, raw);
  }

  int maxLen = 0;
  for (const Raw& r : raw) maxLen = r.play.count > maxLen ? r.play.count : maxLen;
  if (maxLen == 0) return {};

  // Only one die of a non-double playable: the higher die if any play uses it.
  int requiredFirstDie = 0;
  if (die1 != die2 && maxLen == 1) {
    const int higher = die1 > die2 ? die1 : die2;
    for (const Raw& r : raw) {
      if (r.play.count == 1 && r.firstDie == higher) requiredFirstDie = higher;
    }
  }

  std::vector<Play> plays;
  std::unordered_set<std::string> seen;
  for (const Raw& r : raw) {
    if (r.play.count != maxLen) continue;
    if (requiredFirstDie != 0 && r.firstDie != requiredFirstDie) continue;
    std::string key(reinterpret_cast<const char*>(&r.play.result), sizeof(Board));
    if (seen.insert(key).second) plays.push_back(r.play);
  }
  return plays;
}

}  // namespace bg
