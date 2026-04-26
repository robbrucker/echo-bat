import Foundation
import Capacitor
import CoreMotion

// Tiny Capacitor plugin that pumps CMMotionManager accelerometer data
// directly into JavaScript via Capacitor's bridge. WKWebView's
// `window.devicemotion` API is flaky to enable in WKWebView even with
// NSMotionUsageDescription — going native sidesteps the entire permission
// dance. CMMotionManager's raw accelerometer doesn't require a permission
// prompt.
//
// JS side:
//   import { registerPlugin } from "@capacitor/core";
//   const MotionBridge = registerPlugin<MotionBridgePlugin>("MotionBridge");
//   await MotionBridge.start();
//   MotionBridge.addListener("accel", (event) => { ... });
@objc(MotionBridge)
public class MotionBridge: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MotionBridge"
    public let jsName = "MotionBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private let manager = CMMotionManager()

    @objc func start(_ call: CAPPluginCall) {
        // Resolve silently when there's no accelerometer (Simulator). The app
        // still runs fine on touch zones and the menu doesn't show a
        // misleading "denied" message — events just never fire.
        guard manager.isAccelerometerAvailable else {
            call.resolve()
            return
        }
        if manager.isAccelerometerActive {
            call.resolve()
            return
        }
        manager.accelerometerUpdateInterval = 1.0 / 60.0
        manager.startAccelerometerUpdates(to: OperationQueue.main) { [weak self] data, error in
            guard let self = self else { return }
            if let error = error {
                NSLog("MotionBridge accelerometer error: \(error.localizedDescription)")
                return
            }
            guard let data = data else { return }
            // CMAcceleration is in g-units (1.0 = 9.81 m/s²). We pass through
            // raw values; the JS side normalizes the gravity vector anyway.
            self.notifyListeners("accel", data: [
                "x": data.acceleration.x,
                "y": data.acceleration.y,
                "z": data.acceleration.z
            ])
        }
        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        if manager.isAccelerometerActive {
            manager.stopAccelerometerUpdates()
        }
        call.resolve()
    }
}
