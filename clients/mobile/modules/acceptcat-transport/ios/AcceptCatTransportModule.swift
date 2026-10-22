import ExpoModulesCore
import Foundation

private final class NoRedirect: NSObject, URLSessionTaskDelegate {
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                  newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

public class AcceptCatTransportModule: Module {
  private let lock = NSLock()
  private var tasks: [String: URLSessionDataTask] = [:]
  private let delegate = NoRedirect()
  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.httpCookieStorage = nil
    config.httpShouldSetCookies = false
    config.urlCache = nil
    config.timeoutIntervalForRequest = 30
    config.timeoutIntervalForResource = 30
    return URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
  }()
  public func definition() -> ModuleDefinition {
    Name("AcceptCatTransport")
    AsyncFunction("request") { (input: [String: Any], promise: Promise) in
      guard let id = input["id"] as? String, let raw = input["url"] as? String,
        let url = URL(string: raw), url.scheme == "https", url.user == nil, url.password == nil,
        url.path.hasPrefix("/api/v1/"), let method = input["method"] as? String,
        ["GET", "POST", "PATCH"].contains(method), let headers = input["headers"] as? [String: String],
        headers["Origin"] == "https://\(url.host ?? "")" + (url.port.map { $0 == 443 ? "" : ":\($0)" } ?? "")
      else { promise.reject("REQUEST_ERROR", "Invalid network request"); return }
      var request = URLRequest(url: url)
      request.httpMethod = method
      request.allHTTPHeaderFields = headers
      request.httpShouldHandleCookies = false
      if method != "GET" { request.httpBody = (input["body"] as? String ?? "{}").data(using: .utf8) }
      let task = self.session.dataTask(with: request) { data, response, error in
        self.lock.lock(); self.tasks.removeValue(forKey: id); self.lock.unlock()
        guard error == nil, let response = response as? HTTPURLResponse, let data = data,
          data.count <= 8 * 1024 * 1024, let body = String(data: data, encoding: .utf8)
        else { promise.reject("NETWORK_ERROR", "Network request did not complete"); return }
        let cookie = response.value(forHTTPHeaderField: "Set-Cookie")
        promise.resolve(["status": response.statusCode, "body": body, "cookies": cookie.map { [$0] } ?? []])
      }
      self.lock.lock(); self.tasks[id] = task; self.lock.unlock()
      task.resume()
    }
    AsyncFunction("cancel") { (id: String) in
      self.lock.lock(); let task = self.tasks.removeValue(forKey: id); self.lock.unlock(); task?.cancel()
    }
    OnDestroy { self.session.invalidateAndCancel() }
  }
}
