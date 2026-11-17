package com.medreminder

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

/**
 * PermissionModule — Módulo nativo para verificar y solicitar permisos especiales de Android.
 *
 * Nota: Los métodos de sonido (startAlarmSound/stopAlarmSound) y bringAppToForeground
 * fueron eliminados de este módulo. Esas responsabilidades ahora pertenecen a AlarmService.kt,
 * que maneja el audio con MediaPlayer de forma integrada al ciclo de vida del Foreground Service.
 */
class PermissionModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String {
    return "PermissionModule"
  }

  /**
   * Verifica si la app puede usar fullscreen intents (USE_FULL_SCREEN_INTENT).
   * En Android 14+ (API 34) este permiso está desactivado por defecto para apps sideloaded.
   */
  @ReactMethod
  fun canUseFullScreenIntent(promise: Promise) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      val notificationManager = reactApplicationContext.getSystemService(android.app.NotificationManager::class.java)
      promise.resolve(notificationManager.canUseFullScreenIntent())
    } else {
      promise.resolve(true)
    }
  }

  /**
   * Abre la pantalla de Ajustes para que el usuario habilite USE_FULL_SCREEN_INTENT.
   */
  @ReactMethod
  fun openFullScreenIntentSettings() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
        data = Uri.parse("package:${reactApplicationContext.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactApplicationContext.startActivity(intent)
    }
  }

  /**
   * Verifica si la app tiene permiso para dibujar sobre otras apps (SYSTEM_ALERT_WINDOW).
   */
  @ReactMethod
  fun canDrawOverlays(promise: Promise) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      promise.resolve(Settings.canDrawOverlays(reactApplicationContext))
    } else {
      promise.resolve(true)
    }
  }

  /**
   * Abre la pantalla de Ajustes para que el usuario habilite Mostrar sobre otras apps.
   */
  @ReactMethod
  fun openDrawOverlaySettings() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${reactApplicationContext.packageName}")
      ).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactApplicationContext.startActivity(intent)
    }
  }
}
