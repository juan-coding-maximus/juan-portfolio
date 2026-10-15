#!/bin/zsh
# Build the Gas shell and put it on Juan's iPhone (his personal phone).
# The app loads juanarenas.bio/gas live, so a site deploy changes it with no reinstall.
set -e
cd "${0:A:h}"
UDID="${1:-00008150-001A24A0017A401C}"
npx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App -destination "id=$UDID" -configuration Release \
  DEVELOPMENT_TEAM=96L6YKQ6LH -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  -derivedDataPath /tmp/gas-build build | grep -E 'error:|BUILD (SUCCEEDED|FAILED)'
xcrun devicectl device install app --device "$UDID" /tmp/gas-build/Build/Products/Release-iphoneos/App.app
xcrun devicectl device process launch --device "$UDID" com.osmoticventures.gas
