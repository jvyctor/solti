cask "solti" do
  arch arm: "arm64-", intel: ""

  version "0.8.2"
  sha256 arm:   "bd3a8a00edeb3eb3126d6786b4236e79840364b0e156ae4283377be809eb8e22",
         intel: "991e3922512d353647c20958aae7c5783bf5e0c9a57ddc474bfdd9831f04de59"

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
