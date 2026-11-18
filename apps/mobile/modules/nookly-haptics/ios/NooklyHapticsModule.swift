import CoreHaptics
import ExpoModulesCore
import UIKit

/// One beat of a pattern as JavaScript describes it: a tap (`transient`) or a buzz of
/// `duration` seconds (`continuous`), `time` seconds after the start, with an intensity and
/// a sharpness between 0 and 1.
struct HapticEvent: Record {
  @Field var kind: String = "transient"
  @Field var time: Double = 0
  @Field var duration: Double = 0
  @Field var intensity: Double = 0.5
  @Field var sharpness: Double = 0.5
}

private let supportsCoreHaptics = CHHapticEngine.capabilitiesForHardware().supportsHaptics

/// Plays Nookly's patterns on the Taptic Engine. The patterns themselves live in JavaScript
/// (`src/ui/haptics.ts`); this only turns their beats into Core Haptics events, and falls
/// back to the system's feedback generators when the engine cannot run.
public class NooklyHapticsModule: Module {
  private var engine: CHHapticEngine?
  private var running = false

  public func definition() -> ModuleDefinition {
    Name("NooklyHaptics")

    /// False on iPads, the simulator and anything else without a Taptic Engine.
    Constant("supported") { supportsCoreHaptics }

    Function("prepare") {
      _ = self.start()
    }

    Function("play") { (events: [HapticEvent], fallback: String) in
      if !supportsCoreHaptics { return }
      if self.playPattern(events) { return }
      DispatchQueue.main.async { playFallback(fallback) }
    }

    OnDestroy {
      self.engine?.stop(completionHandler: nil)
    }
  }

  /// The engine, started if it was stopped (the app went to the background, audio was
  /// interrupted). Nil when it cannot run.
  private func start() -> CHHapticEngine? {
    if !supportsCoreHaptics { return nil }
    if engine == nil {
      guard let made = try? CHHapticEngine() else { return nil }
      made.playsHapticsOnly = true
      made.isAutoShutdownEnabled = true
      made.stoppedHandler = { [weak self] _ in self?.running = false }
      made.resetHandler = { [weak self] in self?.running = false }
      engine = made
    }
    if !running {
      do {
        try engine?.start()
        running = true
      } catch {
        return nil
      }
    }
    return engine
  }

  private func playPattern(_ events: [HapticEvent]) -> Bool {
    guard let engine = start() else { return false }
    let beats = events.map { event -> CHHapticEvent in
      let parameters = [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: Float(event.intensity)),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: Float(event.sharpness)),
      ]
      if event.kind == "continuous" {
        return CHHapticEvent(
          eventType: .hapticContinuous,
          parameters: parameters,
          relativeTime: event.time,
          duration: event.duration
        )
      }
      return CHHapticEvent(
        eventType: .hapticTransient,
        parameters: parameters,
        relativeTime: event.time
      )
    }
    do {
      let pattern = try CHHapticPattern(events: beats, parameters: [])
      let player = try engine.makePlayer(with: pattern)
      try player.start(atTime: CHHapticTimeImmediate)
      return true
    } catch {
      running = false
      return false
    }
  }
}

/// The plain system feedback a pattern stands in for.
private func playFallback(_ name: String) {
  switch name {
  case "selection":
    UISelectionFeedbackGenerator().selectionChanged()
  case "success":
    UINotificationFeedbackGenerator().notificationOccurred(.success)
  case "warning":
    UINotificationFeedbackGenerator().notificationOccurred(.warning)
  case "error":
    UINotificationFeedbackGenerator().notificationOccurred(.error)
  case "light":
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
  case "soft":
    UIImpactFeedbackGenerator(style: .soft).impactOccurred()
  case "rigid":
    UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
  case "heavy":
    UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
  default:
    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
  }
}
