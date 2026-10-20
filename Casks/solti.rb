cask "solti" do
  arch arm: "arm64-", intel: ""

  version "0.9.0"
  sha256 arm:   "137fe470afe92969036cab32db6790cba193b7399c918e5fbe20a11a1cef1411",
         intel: "b91b1297844ccb909836275bdb3d396f84602804055912697ba5edeaf98332a1"

  url "https://github.com/jvyctor/solti/releases/download/v#{version}/Solti-#{version}-#{arch}mac.zip"
  name "Solti"
  desc "Run a team of AI coding agents side by side on one canvas"
  homepage "https://jvyctor.github.io/solti/"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: ">= :monterey"

  app "Solti.app"

  postflight do
    system_command "/usr/bin/xattr", args: ["-dr", "com.apple.quarantine", "#{appdir}/Solti.app"]
  end

  zap trash: [
    "~/Library/Application Support/Agent Canvas",
    "~/Library/Application Support/Solti",
    "~/Library/Preferences/com.agentcanvas.app.plist",
    "~/Library/Saved Application State/com.agentcanvas.app.savedState",
  ]

  caveats <<~EOS
    Solti is not notarized by Apple yet; this cask clears the quarantine flag so it opens normally.
    Update with: brew upgrade --cask solti
  EOS
end
