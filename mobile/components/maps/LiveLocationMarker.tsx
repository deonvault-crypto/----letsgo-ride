import { ReactNode, useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import { AnimatedRegion, Marker } from "react-native-maps";

import { useMotionSettings } from "../../hooks/useMotionSettings";
import { LocationSample, MapCoordinate, markerMotionDuration, nearestHeading, sampleTime } from "../../utils/mapMotion";

type Props = { location: LocationSample; heading?: number | null; title: string; children: ReactNode; animate?: boolean };

export function LiveLocationMarker({ location, heading = location.heading, title, children, animate = true }: Props) {
  const { canAnimate } = useMotionSettings();
  const coordinate = useRef(new AnimatedRegion(location)).current;
  const rotation = useRef(new Animated.Value(nearestHeading(0, heading))).current;
  const headingTarget = useRef(nearestHeading(0, heading));
  const previous = useRef<LocationSample | null>(null);
  const receivedAt = useRef(0);

  useEffect(() => {
    const nextTime = sampleTime(location);
    const previousTime = previous.current ? sampleTime(previous.current) : null;
    const outdated = nextTime !== null && previousTime !== null && nextTime < previousTime;
    const accepted = outdated && previous.current ? previous.current : location;
    const now = Date.now();
    const duration = canAnimate && animate && !outdated
      ? markerMotionDuration(previous.current, accepted, now - receivedAt.current, now)
      : 0;
    if (!outdated) headingTarget.current = nearestHeading(headingTarget.current, heading);
    const movement = Animated.parallel([
      coordinate.timing({
        latitude: accepted.latitude, longitude: accepted.longitude,
        latitudeDelta: 0, longitudeDelta: 0, toValue: 0,
        duration, easing: Easing.linear, useNativeDriver: false, isInteraction: false,
      }),
      Animated.timing(rotation, {
        toValue: headingTarget.current, duration, easing: Easing.linear,
        useNativeDriver: false, isInteraction: false,
      }),
    ]);
    movement.start();
    if (!outdated) {
      previous.current = accepted;
      receivedAt.current = now;
    }
    return () => movement.stop();
  }, [animate, canAnimate, coordinate, heading, location.latitude, location.longitude, location.recorded_at, location.updated_at, rotation]);

  return (
    <Marker.Animated
      coordinate={coordinate as unknown as MapCoordinate}
      rotation={rotation}
      anchor={{ x: 0.5, y: 0.5 }}
      flat
      title={title}
      tracksViewChanges={false}
    >
      {children}
    </Marker.Animated>
  );
}
