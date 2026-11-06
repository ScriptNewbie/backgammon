#pragma once
// Fixed pool of worker threads. run(tasks, fn) calls fn(0..tasks-1) across the workers and the
// calling thread, and returns when all are done. One run() at a time (callers are serialized).
#include <atomic>
#include <condition_variable>
#include <cstdlib>
#include <functional>
#include <mutex>
#include <thread>
#include <vector>

namespace bg {

class ThreadPool {
 public:
  explicit ThreadPool(int threads) {
    for (int i = 1; i < threads; i++) workers_.emplace_back([this] { loop(); });
  }

  ~ThreadPool() {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      stop_ = true;
    }
    wake_.notify_all();
    for (std::thread& t : workers_) t.join();
  }

  ThreadPool(const ThreadPool&) = delete;
  ThreadPool& operator=(const ThreadPool&) = delete;

  int size() const { return static_cast<int>(workers_.size()) + 1; }

  void run(int tasks, const std::function<void(int)>& fn) {
    if (tasks <= 0) return;
    std::lock_guard<std::mutex> runLock(runMutex_);
    {
      std::lock_guard<std::mutex> lock(mutex_);
      fn_ = &fn;
      tasks_ = tasks;
      next_ = 0;
      done_ = 0;
      generation_++;
    }
    wake_.notify_all();
    work();
    std::unique_lock<std::mutex> lock(mutex_);
    finished_.wait(lock, [&] { return done_ == tasks_; });
    fn_ = nullptr;
  }

  // Process-wide pool sized by SEARCH_THREADS, else the hardware thread count.
  static ThreadPool& shared() {
    static ThreadPool pool([] {
      const char* env = std::getenv("SEARCH_THREADS");
      int n = env ? std::atoi(env) : 0;
      if (n <= 0) n = static_cast<int>(std::thread::hardware_concurrency());
      return n > 0 ? n : 1;
    }());
    return pool;
  }

 private:
  void work() {
    for (;;) {
      const int i = next_.fetch_add(1);
      if (i >= tasks_) return;
      (*fn_.load())(i);
      std::lock_guard<std::mutex> lock(mutex_);
      if (++done_ == tasks_) finished_.notify_all();
    }
  }

  void loop() {
    uint64_t seen = 0;
    for (;;) {
      {
        std::unique_lock<std::mutex> lock(mutex_);
        wake_.wait(lock, [&] { return stop_ || generation_ != seen; });
        if (stop_) return;
        seen = generation_;
      }
      work();
    }
  }

  std::vector<std::thread> workers_;
  std::mutex runMutex_;
  std::mutex mutex_;
  std::condition_variable wake_;
  std::condition_variable finished_;
  std::atomic<const std::function<void(int)>*> fn_{nullptr};
  std::atomic<int> next_{0};
  std::atomic<int> tasks_{0};
  int done_ = 0;
  uint64_t generation_ = 0;
  bool stop_ = false;
};

}  // namespace bg
