// src/components/BootSplash.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, View, Easing } from 'react-native';
// (Opcional) si quieres precargar la imagen para evitar flicker:
// import { Asset } from 'expo-asset';

const VISIBLE_MS = 2500;  // tiempo visible antes de animar
const FADE_MS = 900;      // duración del fade/animación de salida
const LIFT_PX = 24;       // cuánto sube al salir
const ZOOM_TO = 1.06;     // zoom final al salir (1 = sin zoom)

export default function BootSplash() {
  const [done, setDone] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let t: NodeJS.Timeout;

    (async () => {
      // (Opcional) Pre-carga para evitar primer parpadeo:
      // await Asset.fromModule(require('../../assets/tiendaOp.png')).downloadAsync();

      // Pequeño "latido" sutil mientras está visible (zoom 1.0 -> 1.03 -> 1.0 en loop)
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.03, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.00, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      );
      pulse.start();

      // Espera visible y luego anima salida
      t = setTimeout(() => {
        pulse.stop(); // detenemos el “latido” antes de salir
        Animated.parallel([
          Animated.timing(opacity,   { toValue: 0,   duration: FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(translateY,{ toValue: -LIFT_PX, duration: FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(scale,     { toValue: ZOOM_TO,  duration: FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]).start(() => setDone(true));
      }, VISIBLE_MS);
    })();

    return () => { if (t) clearTimeout(t); };
  }, [opacity, translateY, scale]);

  if (done) return null;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.container, { opacity }]}>
      <Animated.Image
        source={require('../../assets/tiendaOp.png')}
        style={[styles.image, { transform: [{ translateY }, { scale }] }]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff', // usa tu color de fondo
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  image: {
    width: 260,
    height: 260,
  },
});
