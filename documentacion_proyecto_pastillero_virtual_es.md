# Aplicación Mobile de Seguimiento de Medicación

# Documentación General del Proyecto

---

# Descripción General

Este proyecto consiste en una aplicación mobile enfocada en el seguimiento de tratamientos médicos y recordatorios de medicación.

La idea principal nace de un problema cotidiano:

> "No recordar si ya tomaste una medicación o no."

En lugar de depender únicamente de alarmas tradicionales, la aplicación busca ofrecer un sistema más confiable y práctico que permita:

- recibir recordatorios de medicación
- confirmar tomas realizadas
- posponer recordatorios
- consultar historial de tomas
- visualizar adherencia al tratamiento
- manejar tratamientos crónicos o temporales

La aplicación debe ser pensada como:

> Un sistema de gestión de tratamientos y adherencia médica.

No simplemente como una app de alarmas.

---

# Objetivos Principales

- Evitar olvidos de medicación
- Permitir confirmar rápidamente una toma
- Saber inmediatamente si una medicación ya fue tomada
- Llevar historial completo de tratamientos
- Gestionar tratamientos prolongados o indefinidos
- Funcionar offline
- Tener recordatorios confiables
- Mantener una experiencia de usuario rápida y simple

---

# Alcance del MVP (Versión 1)

La primera versión del proyecto estará enfocada en:

- almacenamiento local
- funcionamiento offline
- notificaciones locales
- gestión de tratamientos
- historial de tomas
- calendario de adherencia

El backend quedará planificado para una segunda etapa.

---

# Stack Tecnológico Recomendado

## Frontend Mobile

- React Native
- TypeScript
- Expo

## Persistencia Local

- SQLite

## Navegación

- React Navigation

## Notificaciones

- Expo Notifications

## Manejo de fechas

- Day.js o date-fns

---

# Arquitectura General Inicial

```text
[React Native App]
        |
   Base de Datos Local
       SQLite
        |
 Notification Engine
        |
 Scheduler Service
```

---

# Conceptos Principales del Sistema

El sistema gira alrededor de 4 entidades fundamentales:

1. Medication
2. Treatment
3. TreatmentSchedule
4. DoseEvent

---

# Modelo de Entidades

# Medication

Representa el medicamento en sí.

Ejemplos:

- Ibuprofeno 600mg
- Paracetamol 500mg
- Amoxicilina 1g

## Campos

```text
id
name
dose
unit
color
notes
createdAt
```

---

# Treatment

Representa cómo debe tomarse una medicación.

Ejemplos:

- cada 8 horas
- todos los días
- lunes y jueves
- día por medio

## Campos

```text
id
medicationId
frequencyType
intervalHours
timesPerDay
daysOfWeek
startDate
endDate
isIndefinite
active
createdAt
```

---

# TreatmentSchedule

Representa horarios específicos del tratamiento.

Ejemplos:

- 08:00
- 14:00
- 22:00

## Campos

```text
id
treatmentId
hour
minute
```

---

# DoseEvent

Representa una toma específica programada.

Esta es la entidad más importante del sistema.

Ejemplo:

```text
20/05/2026 08:00
PENDING
```

## Campos

```text
id
treatmentId
scheduledAt
takenAt
status
snoozedUntil
notificationId
createdAt
```

---

# Estados de una Toma

```text
PENDING
TAKEN
MISSED
SKIPPED
SNOOZED
```

---

# Relaciones entre Entidades

```text
Medication 1 --- N Treatment

Treatment 1 --- N TreatmentSchedule

Treatment 1 --- N DoseEvent
```

---

# Estrategia de Generación de Eventos

## Problema

Los tratamientos indefinidos no deberían generar notificaciones infinitas.

Ejemplo:

```text
Tomar todos los días a las 08:00
Tratamiento indefinido
```

Generar años completos de eventos sería un error de arquitectura.

---

# Solución Recomendada

## Rolling Window Generation

La aplicación solo generará:

- próximos 7 días
- próximas 48 horas
- próximas notificaciones necesarias

Y regenerará nuevas automáticamente a medida que avance el tiempo.

---

# Beneficios de esta Estrategia

- evita millones de registros innecesarios
- mejora rendimiento
- simplifica cambios de tratamiento
- evita duplicados
- facilita manejo de notificaciones
- soporta tratamientos crónicos correctamente

---

# Regla Importante

## El pasado es inmutable

Los eventos históricos nunca deben modificarse.

Si un tratamiento cambia:

- solo se modifican eventos futuros
- el historial permanece intacto

---

# Scheduler Service

El Scheduler es el corazón del sistema.

## Responsabilidades

- generar eventos futuros
- evitar duplicados
- programar notificaciones
- regenerar eventos faltantes
- limpiar notificaciones vencidas
- sincronizar estados

---

# Sistema de Notificaciones

# Funcionalidades Iniciales

- notificaciones locales
- sonido
- vibración
- acciones rápidas

---

# Acciones desde Notificación

El usuario podrá:

- marcar como tomada
- posponer 15 minutos
- posponer 30 minutos
- omitir dosis

---

# Funcionalidades Futuras Avanzadas

- alarmas persistentes
- pantalla completa estilo despertador
- foreground services Android
- modo medicación crítica
- sonido continuo hasta confirmar

---

# Funcionalidades del MVP

# 1. Gestión de Medicamentos

## Funcionalidades

- crear medicamento
- editar medicamento
- eliminar medicamento
- listar medicamentos

---

# 2. Gestión de Tratamientos

## Funcionalidades

- crear tratamiento
- definir frecuencia
- definir horarios
- tratamientos indefinidos
- finalizar tratamiento
- editar tratamiento

---

# 3. Seguimiento de Tomas

## Funcionalidades

- confirmar toma
- omitir toma
- posponer recordatorio
- actualizar estado automáticamente

---

# 4. Calendario de Historial

## Funcionalidades

- vista mensual
- tomas realizadas
- tomas omitidas
- tomas retrasadas

## Colores sugeridos

- verde → tomada
- rojo → omitida
- amarillo → retrasada

---

# 5. Dashboard Diario

## Funcionalidades

- medicaciones pendientes
- próxima toma
- resumen del día
- acciones rápidas

---

# 6. Funcionalidad Principal

## “¿Ya tomé esta medicación?”

Ejemplo:

```text
Ibuprofeno
Última toma:
Hoy 14:32
```

Esta es una de las funcionalidades más importantes del producto.

Resuelve directamente el problema principal del usuario.

---

# Pantallas del MVP

# 1. Splash Screen

## Responsabilidades

- inicializar base de datos
- inicializar scheduler
- cargar configuraciones
- solicitar permisos

---

# 2. Onboarding

Explica:

- permisos de notificaciones
- optimización de batería
- funcionamiento general
- importancia de permitir alarmas

---

# 3. Home Dashboard

Pantalla principal.

## Contenido

- próxima medicación
- medicaciones pendientes
- progreso del día
- acciones rápidas

---

# 4. Lista de Medicamentos

Muestra:

- medicamentos
- colores
- tratamientos activos

## Acciones

- crear
- editar
- eliminar

---

# 5. Crear Medicamento

Pantalla de formulario.

## Campos sugeridos

- nombre
- dosis
- unidad
- color
- notas

---

# 6. Crear Tratamiento

Pantalla compleja del sistema.

## Debe permitir

### Frecuencia

- diario
- cada X horas
- días específicos
- día por medio

### Horarios

### Fecha inicio

### Fecha fin opcional

### Tratamiento indefinido

### Configuración notificaciones

- sonido
- vibración
- persistencia

---

# 7. Calendario

Vista mensual de adherencia.

## Permite visualizar

- tomas
- retrasos
- omitidas
- detalles del día

---

# 8. Historial

Lista cronológica de eventos.

## Muestra

- horario programado
- horario real
- estado
- retraso

---

# 9. Detalle de Medicamento

## Información

- tratamiento activo
- próximas tomas
- adherencia
- historial

---

# 10. Configuración

## Opciones

- sonido
- vibración
- modo oscuro
- preferencias de notificaciones
- permisos

---

# Navegación Recomendada

```text
Bottom Tabs

- Inicio
- Calendario
- Medicamentos
- Historial
- Configuración
```

---

# Flujo Principal del Sistema

```text
Usuario crea medicamento
        ↓
Usuario crea tratamiento
        ↓
Scheduler genera próximos eventos
        ↓
Se programan notificaciones
        ↓
Usuario recibe recordatorio
        ↓
Usuario confirma toma
        ↓
Historial se actualiza
        ↓
Scheduler genera nuevos eventos futuros
```

---

# Estructura Recomendada Frontend

```text
src/
 ├── screens/
 ├── components/
 ├── services/
 ├── database/
 ├── notifications/
 ├── scheduler/
 ├── hooks/
 ├── navigation/
 ├── models/
 ├── utils/
 └── constants/
```

---

# Módulos Importantes

# Scheduler Module

Responsable de:

- generar eventos
- evitar duplicados
- manejar recurrencias
- regenerar eventos faltantes

---

# Notification Service

Responsable de:

- programar notificaciones
- cancelar notificaciones
- posponer recordatorios
- reprogramar eventos

---

# Calendar Engine

Responsable de:

- cálculos de adherencia
- estadísticas
- visualización calendario

---

# Principios UX

La aplicación debe priorizar:

- confiabilidad
- claridad
- velocidad
- accesibilidad
- mínima fricción

El usuario debe poder:

- saber rápidamente si tomó una medicación
- confirmar acciones fácilmente
- evitar confusiones
- navegar con pocos pasos

---

# Objetivos de Accesibilidad

La aplicación debería soportar:

- tipografía grande
- alto contraste
- navegación simple
- uso con una mano
- accesibilidad para adultos mayores

---

# Prompt para Stitch

```text
Design a modern mobile application UI for a medication reminder and treatment tracking app.

Style:
- clean
- minimal
- accessible
- modern health-tech aesthetic
- rounded cards
- soft shadows
- calm colors
- focus on usability for daily use
- optimized for elderly accessibility too

Main features:
- dashboard with today's medications
- upcoming dose card
- quick actions: Taken / Snooze / Skip
- medication history
- treatment calendar
- medication management
- treatment scheduling
- reminder settings

Important UX goals:
- instantly know if medication was already taken
- large readable typography
- clear status colors
- easy one-hand usage
- persistent reminder feel
- highly intuitive navigation

Screens to generate:
1. Home dashboard
2. Medication list
3. Create treatment flow
4. Calendar history
5. Medication detail
6. Reminder notification modal
7. Settings page

Visual direction:
- similar quality level to modern healthcare apps
- soft blue/green palette
- dark mode compatible
- Android-first design
- card-based layout
- bottom tab navigation

Include:
- realistic medication cards
- adherence indicators
- progress rings
- reminder banners
- upcoming medication timeline
```

---

# Versión 2 — Backend y Sincronización

## Backend Recomendado

- Spring Boot

---

# Funcionalidades Futuras

# 1. Autenticación

- email/password
- JWT

---

# 2. Backup Cloud

Permitir:

- restaurar historial
- sincronizar dispositivos
- evitar pérdida de datos

---

# 3. Multi Dispositivo

Ejemplos:

- celular nuevo
- tablet
- sincronización entre dispositivos

---

# 4. Compartir Tratamientos

Casos de uso:

- adultos mayores
- familiares
- cuidadores

---

# 5. Dashboard Web

Posible integración futura con React web.

---

# Versión 3 — Funcionalidades Avanzadas

# Estadísticas de Adherencia

Ejemplos:

- porcentaje cumplimiento
- retrasos frecuentes
- patrones de olvido

---

# Exportación PDF

Para compartir con médicos.

---

# Alarmas Críticas

- pantalla completa
- sonido persistente
- comportamiento estilo despertador

---

# Widgets Android

Ejemplo:

```text
Próxima medicación:
20:00
```

Sin abrir la aplicación.

---

# Posibles Funcionalidades con IA

Ejemplos:

```text
"Últimamente olvidás la medicación nocturna"
```

```text
"Tu adherencia disminuyó esta semana"
```

---

# Visión a Largo Plazo

Este proyecto debería ser tratado como:

- un producto real
- una solución real
- una aplicación health-tech

La prioridad siempre debe ser:

- confiabilidad
- precisión de horarios
- consistencia de notificaciones
- confianza del usuario
- experiencia simple y rápida

