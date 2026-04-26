import UIKit
import Capacitor

// Custom bridge view controller that explicitly registers our app-local
// plugins. Capacitor 8's auto-discovery scans Objective-C runtime for
// CAPBridgedPlugin conformers, but app-local plugins inside CapApp-SPM
// aren't always picked up reliably. Manual registration is the bulletproof
// path. Set as the storyboard's root VC custom class.
@objc(MainViewController)
public class MainViewController: CAPBridgeViewController {

    override public func capacitorDidLoad() {
        bridge?.registerPluginInstance(MotionBridge())
    }
}
