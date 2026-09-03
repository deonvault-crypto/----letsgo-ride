import { useLayoutEffect, useRef } from "react";
import { Animated, Easing, ViewProps } from "react-native";

import { useMotionSettings } from "../../hooks/useMotionSettings";

type MotionViewProps = ViewProps & {
  changeKey?: string | number | boolean | null;
  animateOnMount?: boolean;
  distance?: number;
};

// Replaces an existing View; it does not introduce a surface or delay content.
export function MotionView({ changeKey, animateOnMount = false, distance = 4, style, ...props }: MotionViewProps) {
  const { canAnimate } = useMotionSettings();
  const progress = useRef(new Animated.Value(1)).current;
  const previousKey = useRef(changeKey);
  const mounted = useRef(false);

  useLayoutEffect(() => {
    const changed = mounted.current ? previousKey.current !== changeKey : animateOnMount;
    mounted.current = true;
    previousKey.current = changeKey;
    if (!canAnimate || !changed) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [animateOnMount, canAnimate, changeKey, progress]);

  return (
    <Animated.View
      {...props}
      style={[
        style,
        canAnimate ? {
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }),
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
        } : { opacity: 1, transform: [{ translateY: 0 }] },
      ]}
    />
  );
}
