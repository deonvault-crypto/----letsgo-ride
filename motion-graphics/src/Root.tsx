import React from 'react';
import {Composition} from 'remotion';
import {LetsGoRideNoCommission} from './LetsGoRideNoCommission';
import {LetsGoRideZimbabweLaunch} from './LetsGoRideZimbabweLaunch';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="LetsGoRideZimbabweLaunch"
        component={LetsGoRideZimbabweLaunch}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{sound: true}}
      />
      <Composition
        id="LetsGoRideVertical"
        component={LetsGoRideNoCommission}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{format: 'vertical' as const}}
      />
      <Composition
        id="LetsGoRideLandscape"
        component={LetsGoRideNoCommission}
        durationInFrames={450}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{format: 'landscape' as const}}
      />
    </>
  );
};
