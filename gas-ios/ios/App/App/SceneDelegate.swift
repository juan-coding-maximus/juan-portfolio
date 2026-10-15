import UIKit
import Capacitor
import CoreLocation

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        LocationAlways.ask()
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

/// Location is Always for this app, so it opens already located with no prompt.
/// A first launch asks (iOS answers While Using and holds Always provisionally);
/// a phone already on While Using gets iOS's one-time "Change to Always Allow"
/// prompt. iOS allows no second ask from the app after that, so nothing nags:
/// the setting lives in Settings > Gas > Location.
@MainActor
final class LocationAlways: NSObject, CLLocationManagerDelegate {
    private static let shared = LocationAlways()
    private static let upgradeAsked = "location.alwaysUpgradeAsked"
    private let manager = CLLocationManager()

    private override init() {
        super.init()
        manager.delegate = self
    }

    static func ask() {
        shared.askIfNeeded()
    }

    private func askIfNeeded() {
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestAlwaysAuthorization()
        case .authorizedWhenInUse where !UserDefaults.standard.bool(forKey: Self.upgradeAsked):
            UserDefaults.standard.set(true, forKey: Self.upgradeAsked)
            manager.requestAlwaysAuthorization()
        default:
            break
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in self.askIfNeeded() }
    }
}
