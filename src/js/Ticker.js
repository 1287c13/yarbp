export class Ticker {
  constructor(delay = 120) {
    this.delay = delay;
    this.timer = null;
    this.callback = null;
  }

  schedule(cb) {
    this.callback = cb;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      const cb = this.callback;
      this.callback = null;
      if (cb) cb();
    }, this.delay);
  }

  cancel() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.callback = null;
  }
}