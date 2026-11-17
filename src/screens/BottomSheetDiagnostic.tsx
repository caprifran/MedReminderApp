/**
 * PANTALLA DE DIAGNÓSTICO — BottomSheetModal
 * ==========================================
 * Pantalla MÍNIMA para aislar el problema con BottomSheetModal.
 * Sin Zustand, sin lógica, sin listas, sin ScrollView.
 *
 * Qué mide:
 *  - Si el componente monta correctamente
 *  - Si el ref se asigna
 *  - Si present() se ejecuta
 *  - Si el modal responde a onChange
 *  - Si onAnimate se dispara
 *  - Si el backdrop se renderiza
 *  - Si BottomSheetView carga contenido
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetModalProvider,
  useBottomSheetModal,
} from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// ─── INNER CONTENT (dentro del sheet) ────────────────────────────────────────
const SheetContent = () => {
  useEffect(() => {
    console.log('[DIAG] ✅ SheetContent MOUNTED — el modal renderiza contenido');
    return () => {
      console.log('[DIAG] SheetContent UNMOUNTED');
    };
  }, []);

  return (
    <BottomSheetView style={styles.sheetContent}>
      <Text style={styles.sheetTitle}>✅ BottomSheet funcionando</Text>
      <Text style={styles.sheetBody}>Si ves esto, el modal está abierto correctamente.</Text>
    </BottomSheetView>
  );
};

// ─── INNER BUTTON (usa el hook de contexto para dismiss) ─────────────────────
const DismissButton = () => {
  const { dismiss } = useBottomSheetModal();
  return (
    <TouchableOpacity style={styles.dismissBtn} onPress={() => {
      console.log('[DIAG] DismissButton presionado');
      dismiss();
    }}>
      <Text style={styles.dismissText}>Cerrar</Text>
    </TouchableOpacity>
  );
};

// ─── PANTALLA PRINCIPAL ───────────────────────────────────────────────────────
export const BottomSheetDiagnostic = () => {
  console.log('[DIAG] BottomSheetDiagnostic RENDER');

  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['50%'], []);

  // 1. Verificar que el ref se asigna
  useEffect(() => {
    const checkRef = () => {
      if (bottomSheetModalRef.current) {
        console.log('[DIAG] ✅ REF asignado correctamente:', typeof bottomSheetModalRef.current);
      } else {
        console.log('[DIAG] ❌ REF es null — el componente no montó');
      }
    };
    // Dar tiempo para que React finalice el render
    const t = setTimeout(checkRef, 100);
    return () => clearTimeout(t);
  }, []);

  const handlePresentModalPress = useCallback(() => {
    console.log('[DIAG] ─── BOTÓN PRESIONADO ───');
    console.log('[DIAG] ref.current:', bottomSheetModalRef.current);

    if (!bottomSheetModalRef.current) {
      console.log('[DIAG] ❌ ref.current es null — present() no se puede llamar');
      Alert.alert('DIAGNÓSTICO', 'REF es null. El BottomSheetModal no montó.');
      return;
    }

    console.log('[DIAG] Llamando a present()...');
    bottomSheetModalRef.current.present();
    console.log('[DIAG] present() llamado');
  }, []);

  const handleSheetChanges = useCallback((index: number) => {
    console.log('[DIAG] onChange disparado — index:', index);
  }, []);

  const handleAnimate = useCallback((fromIndex: number, toIndex: number) => {
    console.log(`[DIAG] onAnimate disparado — from ${fromIndex} to ${toIndex}`);
  }, []);

  const renderBackdrop = useCallback((props: any) => {
    console.log('[DIAG] renderBackdrop llamado');
    return (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    );
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Diagnóstico BottomSheet</Text>
      <Text style={styles.subtitle}>
        Pantalla mínima de prueba.{'\n'}
        Sin Zustand, sin listas, sin ScrollView.
      </Text>

      <TouchableOpacity style={styles.button} onPress={handlePresentModalPress}>
        <Text style={styles.buttonText}>ABRIR BOTTOM SHEET</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>Revisar consola del debugger para logs [DIAG]</Text>

      <BottomSheetModal
        ref={bottomSheetModalRef}
        index={0}
        snapPoints={snapPoints}
        onChange={handleSheetChanges}
        onAnimate={handleAnimate}
        backdropComponent={renderBackdrop}
        enableDynamicSizing={false}
      >
        <SheetContent />
        <DismissButton />
      </BottomSheetModal>
    </View>
  );
};

// ─── WRAPPER con sus propios providers (auto-contenido para prueba aislada) ───
export const BottomSheetDiagnosticScreen = () => {
  console.log('[DIAG] BottomSheetDiagnosticScreen RENDER — con providers propios');
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <BottomSheetDiagnostic />
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#111',
  },
  subtitle: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 22,
  },
  button: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    elevation: 4,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  hint: {
    marginTop: 24,
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
  },
  sheetContent: {
    padding: 24,
    alignItems: 'center',
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#111',
  },
  sheetBody: {
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
  },
  dismissBtn: {
    margin: 24,
    backgroundColor: '#F44336',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  dismissText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
});
