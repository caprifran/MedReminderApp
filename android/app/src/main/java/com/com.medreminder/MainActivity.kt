package com.medreminder

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.util.Log
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    Log.d("AlarmService", "[ALARM_DEBUG] MainActivity onCreate called at T=${System.currentTimeMillis()}ms")
    super.onCreate(null)
    applyAlarmWindowFlags()
  }

  /**
   * onNewIntent se llama cuando MainActivity ya está activa (singleTask) y
   * AlarmService la trae al frente con startActivity().
   * Aquí podríamos procesar los extras del Intent si fuera necesario,
   * pero en esta arquitectura React Native los lee via AlarmModule.getActiveAlarmId()
   * desde SharedPreferences al detectar el cambio de estado de la app.
   */
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    Log.d("AlarmService", "[ALARM_DEBUG] MainActivity onNewIntent called at T=${System.currentTimeMillis()}ms")
    setIntent(intent) // Actualiza el intent actual para que getIntent() devuelva el último
  }

  /**
   * Aplica los flags de ventana necesarios para que la alarma pueda mostrarse
   * sobre la pantalla de bloqueo y encender la pantalla.
   *
   * setShowWhenLocked(true): Permite que la Activity se muestre encima del lock screen.
   * setTurnScreenOn(true): Enciende la pantalla si está apagada cuando la Activity se abre.
   * requestDismissKeyguard: Descarta el keyguard (solo funciona en dispositivos sin PIN/biometría).
   *
   * En APIs < 27 usamos los flags de ventana legacy (deprecated pero funcionales).
   */
  private fun applyAlarmWindowFlags() {
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      val keyguardManager = getSystemService(android.content.Context.KEYGUARD_SERVICE)
          as android.app.KeyguardManager
      keyguardManager.requestDismissKeyguard(this, null)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
          or android.view.WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
          or android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
          or android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      hideNavigationBar()
    }
  }

  /**
   * Oculta la barra de navegación (back/home/apps recientes) cuando la app tiene el foco.
   * Usa IMMERSIVE_STICKY para que vuelva a ocultarse automáticamente si el usuario
   * la desliza hacia arriba y luego deja de interactuar.
   */
  private fun hideNavigationBar() {
    @Suppress("DEPRECATION")
    window.decorView.systemUiVisibility = (
      View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
        or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
    )
  }

  override fun getMainComponentName(): String = "MedReminder"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
