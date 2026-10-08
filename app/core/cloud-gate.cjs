class CloudGate {
  constructor() { this.retryAt = 0; this.session = 0; this.busy = false; }
  reason(now, settings, hasKey, fallback = false) {
    if (!settings.robotEnabled) return 'disabled';
    if (!hasKey) return 'missing-key';
    if (this.busy) return 'busy';
    if (!fallback && now < this.retryAt) return 'provider-wait';
    return '';
  }
  reserve(now, settings, hasKey, fallback = false) {
    const reason = this.reason(now, settings, hasKey, fallback); if (reason) return reason;
    this.retryAt = 0; this.busy = true; this.session++; return '';
  }
  reserveFallback(now, settings, hasKey) { return this.reserve(now, settings, hasKey, true); }
  // Successful scenes can reconnect immediately. Only failed requests back off,
  // automatically, so an outage cannot create a tight connection loop.
  failed(now) { this.retryAt = now + 60000; }
  finish() { this.busy = false; }
}
module.exports = { CloudGate };
