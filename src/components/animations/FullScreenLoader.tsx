import React, { useEffect } from 'react';
import { View, StyleSheet, Modal, Text } from 'react-native';
import { ActivityIndicator, useTheme } from 'react-native-paper';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

interface FullScreenLoaderProps {
  visible: boolean;
  message?: string;
  transparent?: boolean;
}

export const FullScreenLoader: React.FC<FullScreenLoaderProps> = ({
  visible,
  message = 'Cargando...',
  transparent = false,
}) => {
  const theme = useTheme();

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <Animated.View
        entering={FadeIn.duration(300)}
        exiting={FadeOut.duration(300)}
        style={[
          styles.overlay,
          {
            backgroundColor: transparent
              ? 'transparent'
              : theme.dark
              ? 'rgba(0, 0, 0, 0.85)' // Backdrop muy oscuro para modo oscuro
              : 'rgba(0, 0, 0, 0.65)', // Backdrop medio oscuro para modo claro
          },
        ]}
      >
        <View
          style={[
            styles.container,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <ActivityIndicator size="large" color={theme.colors.primary} />
          {message && (
            <Text style={[styles.message, { color: theme.colors.onSurface }]}>
              {message}
            </Text>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    // zIndex alto para asegurar que tape todo
    zIndex: 9999,
    elevation: 9999,
  },
  container: {
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    minWidth: 200,
  },
  message: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
});
