'use client';

import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import Image from 'next/image';

interface AppImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  fill?: boolean;
  sizes?: string;
  unoptimized?: boolean;
  [key: string]: any;
}

const AppImage = memo(
  ({
    src,
    alt,
    width,
    height,
    className,
    fill = false,
    sizes,
    unoptimized = false,
    ...props
  }: AppImageProps) => {
    const [hasError, setHasError] = useState(false);
    const [currentSrc, setCurrentSrc] = useState(src);

    // Reset dello stato se la prop src cambia
    useEffect(() => {
      setCurrentSrc(src);
      setHasError(false);
    }, [src]);

    // Logica per le immagini esterne
    const isExternal = useMemo(() => typeof src === 'string' && src.startsWith('http'), [src]);
    const shouldBeUnoptimized = unoptimized || isExternal;

    const handleError = useCallback(() => {
      setHasError(true);
      setCurrentSrc('/placeholder.png'); // Assicurati di avere questo file in /public
    }, []);

    const imageProps = {
      alt,
      className,
      onError: handleError,
      unoptimized: shouldBeUnoptimized,
      ...props,
    };

    if (fill) {
      return (
        <div className="relative w-full h-full">
          <Image
            {...imageProps}
            src={currentSrc}
            fill
            sizes={sizes || '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'}
          />
        </div>
      );
    }

    return <Image {...imageProps} src={currentSrc} width={width || 400} height={height || 300} />;
  }
);

AppImage.displayName = 'AppImage';

export default AppImage;
