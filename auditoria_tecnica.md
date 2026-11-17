# Auditoría Técnica: MedReminder

**Fecha:** 22 de Mayo de 2026
**Rol:** Senior/Staff Software Engineer
**Alcance:** Revisión arquitectónica de aplicación React Native CLI Híbrida (TypeScript, Zustand, SQLite, Android Native).

---

> [!WARNING]
> **Resumen Ejecutivo**
> El proyecto tiene fundaciones nativas excelentes (el manejo de alarmas en Android es robusto y resuelve el mayor problema de las apps de recordatorios en RN). Sin embargo, la capa de React Native sufre de **fuerte acoplamiento, deuda técnica arquitectónica y violaciones críticas de principios SOLID**, específicamente en la gestión del estado global y las pantallas. Si el proyecto planea escalar a sincronización en la nube o equipos de múltiples desarrolladores, es **crítico** refactorizar la capa de datos y separar responsabilidades pronto.

## 1. REVISIÓN DE ARQUITECTURA (Capas y Modularidad)

### Estado Actual
El proyecto usa una estructura por tipo de archivo (`components/`, `screens/`, `store/`, `services/`, `database/`).
* **Lo que está BIEN:** Existe una abstracción de servicios nativos (`AlarmService.ts` aísla el bridge nativo) y de utilidades (`SchedulerService.ts`).
* **Lo que va a ROMPERSE:** No hay separación de dominio (Domain-Driven). La capa de base de datos (`sqlite.ts`) se consume directamente desde el store global (`useMedicationStore.ts`). Al crecer, cuando intentes agregar sincronización a un backend, tendrás que reescribir todo el store porque la persistencia local está hardcodeada dentro de él.

### Deuda Técnica Crítica: El "God Object"
El archivo `useMedicationStore.ts` (649+ líneas) es un **God Object**. Hace:
1. Orquestación del estado de la UI (Zustand).
2. Consultas y mutaciones directas en SQL (`db.executeSql`).
3. Lógica de negocio de reprogramación de tratamientos.
4. Llamadas a módulos nativos (`AlarmService`).

## 2. PRINCIPIOS SOLID

**S — Single Responsibility Principle (Violación CRÍTICA)**
* **Componentes Gigantes:** `MedicationsScreen.tsx` (+700 líneas) maneja: el renderizado de la lista, animaciones, lógica de filtrado, un asistente/wizard completo de 3 pasos para crear medicamentos (estado de 15 variables sueltas como `name`, `dose`, `color`), y llamadas directas al Picker de Android.
* **El Store:** Zustand debería ser puramente cliente/estado en memoria. Al mezclar SQL allí, el store tiene múltiples motivos para cambiar (ej. si cambia la DB, si cambia la UI, si cambia la lógica de alarma).

**O — Open/Closed Principle (Riesgo)**
* Agregar un nuevo tipo de frecuencia (ej. "Toma según demanda") requeriría modificar sentencias SQL dispersas, la UI, el Scheduler y el Store, demostrando que el diseño no está abierto a extensión sin modificación.

**D — Dependency Inversion (Violación)**
* Los servicios y stores dependen de implementaciones concretas (`sqlite.ts` y sentencias SQL literales) en lugar de interfaces (ej. `IMedicationRepository`).

## 3. REACT NATIVE BEST PRACTICES

### Problemas de Performance y Anti-patrones Detectados:
1. **FlatList Re-renders (`MedicationsScreen.tsx`):**
   La función `renderMedicationItem` está declarada *dentro* del cuerpo del componente y no está envuelta en un `useCallback`. En cada renderizado (incluso al escribir en un input del formulario modal), se recrea la función de renderizado, causando que la `FlatList` deseche su memoización y re-renderice todos los elementos.
   * *Solución:* Mover `renderMedicationItem` fuera del componente, o usar `useCallback`, y extraer el item a un subcomponente puro (ej. `<MedicationListItem React.memo>`).

2. **Gestión de Formularios Abusiva:**
   Tener 15 variables de estado separadas (`const [name, setName] = useState('')`, `[dose, setDose]...`) dentro de una pantalla que además renderiza una lista pesada es un anti-patrón de performance.
   * *Solución:* Usar `react-hook-form` para manejar los inputs de manera incontrolada y evitar re-renders por cada tecla pulsada.

3. **Inconsistencia de Plataforma (Date Pickers):**
   El uso imperativo en Android `DateTimePickerAndroid.open()` vs declarativo en iOS dentro del JSX del modal inyecta mucha complejidad condicional (`Platform.OS === 'ios'`).

## 4. ANDROID NATIVO (El punto fuerte y sus riesgos)

> [!TIP]
> **Arquitectura Nativa:** El diseño de usar `AlarmManager.setExactAndAllowWhileIdle()` junto con un Foreground Service de Kotlin y un MediaPlayer independiente del hilo de JS es la **única forma correcta** de hacer un pastillero en Android. ¡Excelente decisión!

### Riesgos y Puntos a Auditar:
1. **WakeLocks:**
   Asegúrate de que en `AlarmService.kt` o `AlarmReceiver.kt`, al dispararse el Wakelock (`PARTIAL_WAKE_LOCK`), se esté liberando en un bloque `finally` o usando un timeout estricto. Un Wakelock huérfano (si el usuario nunca descarta la alarma) matará la batería del dispositivo y Google Play puede penalizar la app.
2. **Interacciones Main Thread JS vs Nativo:**
   Cuando suena la alarma, abres un Overlay en RN. Si la app estaba "muerta", iniciar el contexto JS de React Native toma entre 0.5s y 2s. Durante ese tiempo, la alarma ya está sonando nativamente. Esto está bien diseñado, pero asegúrate de que RN no bloquee el hilo de UI de Android durante la hidratación del `useMedicationStore`.
3. **Android 14 (API 34+):**
   Google ha endurecido el permiso `SCHEDULE_EXACT_ALARM`. Ahora es *denegado por defecto* para nuevas instalaciones en Android 14. El fallback `canScheduleExactAlarms()` y guiar a Ajustes que tienes implementado es fundamental y correcto.

## 5. ESCALABILIDAD A FUTURO

Si esta app evoluciona hacia una arquitectura Cloud (Cuentas, Backend, Web, Sincronización):
* **Cuello de Botella:** La persistencia acoplada.
* **Solución necesaria:** Implementar el **Patrón Repositorio**. La lógica de la app debería pedir datos a un `MedicationRepository.getMedications()`. Detrás de escena, ese repositorio sabrá si busca en SQLite (offline mode) o hace un fetch a una API REST / Firebase. Hoy, como el SQL está incrustado en Zustand, escalar a la nube significará rehacer el 70% de la lógica.

## 6. ESTRUCTURA IDEAL Y RECOMENDACIÓN DE REFACTORING

Se recomienda migrar progresivamente a una **Feature-Based Architecture (o Vertical Slices)** combinada con **Clean Architecture Lite**.

### Estructura Propuesta:
```text
src/
 ├─ core/
 │   ├─ database/       # SQLite config, migraciones
 │   ├─ native/         # Wrappers de módulos nativos (AlarmService)
 │   └─ theme/          # UI tokens, Paper Provider
 ├─ shared/
 │   ├─ components/     # Botones, Loaders, Layouts genéricos
 │   └─ utils/          # Formateo de fechas (dayjs)
 ├─ features/
 │   ├─ medications/
 │   │   ├─ components/ # Ej: Formulario de medicación, MedicationCard
 │   │   ├─ screens/    # MedicationsScreen (Solo UI y orquestación)
 │   │   ├─ store/      # medicationStore (Zustand: Solo estado en memoria)
 │   │   ├─ services/   # Repositorios (Llamadas a SQLite o API)
 │   │   └─ types/      # Interfaces de dominio
 │   ├─ alarms/
 │   │   ├─ components/ # AlarmOverlay, BottomSheets
 │   │   └─ scheduler/  # SchedulerService
```

### Plan de Acción y Quick Wins (Priorizados)

1. **[CRÍTICO] Extraer el Formulario de la Pantalla Principal:**
   Sacar el código del asistente de creación (los 3 pasos) de `MedicationsScreen.tsx` hacia un componente dedicado (ej. `<MedicationWizardModal />`) o su propia pantalla. Esto limpiará 400 líneas instantáneamente y mejorará la performance al aislar los re-renders del formulario.
2. **[IMPORTANTE] Aislar la Base de Datos:**
   Crear un `MedicationRepository.ts`. Mover todos los `db.executeSql` desde el `useMedicationStore.ts` hacia el repositorio. Zustand solo debe hacer `const data = await MedicationRepository.getAll(); set({ medications: data });`.
3. **[IMPORTANTE] Optimización de Listas:**
   Envolver `renderMedicationItem` en `useCallback` y `React.memo` para evitar cascadas de render al tipear.
4. **[MEJORA FUTURA] Zustand -> React Query (opcional):**
   Si a futuro integras un backend, considera reemplazar el fetching de estado de Zustand con `@tanstack/react-query` junto al almacenamiento local, dejando Zustand únicamente para estados síncronos de UI (ej. abrir modales, preferencias de tema).
