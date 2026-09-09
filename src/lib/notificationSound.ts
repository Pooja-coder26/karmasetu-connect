/**
 * KarmaSetu Connect - Notification Sound System
 *
 * Provides pleasant, lightweight notification sound chimes for real-time
 * notifications, OTP success, and authentication success events.
 *
 * Fully respects the user's Notification Sound ON/OFF setting in localStorage.
 * Includes deduplication guards to prevent duplicate sounds from re-renders or state changes.
 */

const NOTIFICATION_SOUND_KEY = 'notification_sound';
let lastSoundTime = 0;
const SOUND_DEBOUNCE_MS = 500;

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    const AudioCtxClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) return null;

    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtxClass();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Checks if the user has Notification Sound enabled.
 * Defaults to true (ON) if not explicitly set to 'false'.
 */
export function isNotificationSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const val = localStorage.getItem(NOTIFICATION_SOUND_KEY);
    // ON by default unless explicitly disabled
    return val !== 'false' && val !== '0' && val !== 'disabled';
  } catch {
    return true;
  }
}

/**
 * Updates the user's Notification Sound setting in localStorage.
 */
export function setNotificationSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(NOTIFICATION_SOUND_KEY, enabled ? 'true' : 'false');
    // Dispatch a custom event so UI components can update reactively
    window.dispatchEvent(
      new CustomEvent('notificationSoundSettingChanged', {
        detail: { enabled },
      })
    );
  } catch (err) {
    console.warn('Failed to save notification sound preference:', err);
  }
}

/**
 * Plays a pleasant, two-tone notification chime (D5 -> A5)
 * using the HTML5 Web Audio API.
 *
 * Respects the Notification Sound setting.
 * Deduplicated with a 500ms debounce guard.
 */
export function playNotificationSound(_eventTag?: string): void {
  if (!isNotificationSoundEnabled()) {
    return;
  }

  const now = Date.now();
  if (now - lastSoundTime < SOUND_DEBOUNCE_MS) {
    return;
  }
  lastSoundTime = now;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const startTime = ctx.currentTime;

    // First tone (587.33 Hz - D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, startTime);

    gain1.gain.setValueAtTime(0.001, startTime);
    gain1.gain.exponentialRampToValueAtTime(0.18, startTime + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(startTime);
    osc1.stop(startTime + 0.13);

    // Second higher tone (880.00 Hz - A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, startTime + 0.08);

    gain2.gain.setValueAtTime(0.001, startTime + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.22, startTime + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.35);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(startTime + 0.08);
    osc2.stop(startTime + 0.36);
  } catch (err) {
    // Non-fatal: Autoplay policy or audio device issue
  }
}
