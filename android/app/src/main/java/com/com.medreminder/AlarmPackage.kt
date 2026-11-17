package com.medreminder

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * AlarmPackage — ReactPackage que registra AlarmModule en el sistema de React Native.
 *
 * Todos los Native Modules necesitan un ReactPackage para ser registrados.
 * Este package se añade en MainApplication.kt dentro del PackageList.
 */
class AlarmPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(AlarmModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
