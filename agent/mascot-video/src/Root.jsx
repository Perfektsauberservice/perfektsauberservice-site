import React from 'react';
import { Composition } from 'remotion';
import { MaxIntro } from './MaxIntro.jsx';

export const RemotionRoot = () => {
  return (
    <Composition
      id="MaxIntro"
      component={MaxIntro}
      durationInFrames={450}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ audioSrc: true }}
    />
  );
};
