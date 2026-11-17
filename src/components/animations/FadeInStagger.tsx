import React, { useEffect } from 'react';
import { ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

interface FadeInStaggerProps {
  index: number;
  children: React.ReactNode;
  delayPerItem?: number;
  initialOffset?: number;
  style?: StyleProp<ViewStyle>;
}

export const FadeInStagger: React.FC<FadeInStaggerProps> = ({
  index,
  children,
  delayPerItem = 100, // milisegundos de escalonamiento por item
  initialOffset = 20, // cuánto se traslada desde abajo
  style,
}) => {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(initialOffset);

  useEffect(() => {
    const totalDelay = index * delayPerItem;
    opacity.value = withDelay(
      totalDelay,
      withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) })
    );
    translateY.value = withDelay(
      totalDelay,
      withTiming(0, { duration: 400, easing: Easing.out(Easing.quad) })
    );
  }, [index]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ translateY: translateY.value }],
    };
  });

  return (
    <Animated.View style={[animatedStyle, style]}>
      {children}
    </Animated.View>
  );
};
