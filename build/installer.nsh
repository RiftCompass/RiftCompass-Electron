; Custom uninstall steps for electron-builder's NSIS template (round 33).
;
; electron-builder's uninstaller only removes its own installation keys.
; Two things it leaves behind, seen on the development PC after a
; reinstall: the auto-launch value Electron's app.setLoginItemSettings()
; writes under HKCU\...\Run (an orphan entry in Task Manager > Startup
; pointing at an exe that no longer exists), and the app data folder with
; the encrypted session token. The Run value is named after the app by
; Electron ("electron.app.<productName>"); the folder is handled by
; `deleteAppDataOnUninstall` in electron-builder.yml.
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.RiftCompass"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "RiftCompass"
!macroend
