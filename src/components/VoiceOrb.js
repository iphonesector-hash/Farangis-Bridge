import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../theme';

export default function VoiceOrb({ mode = 'idle' }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: mode === 'listening' ? 650 : 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: mode === 'listening' ? 650 : 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const rotateLoop = Animated.loop(Animated.timing(rotate, { toValue: 1, duration: mode === 'thinking' ? 1700 : 4200, easing: Easing.linear, useNativeDriver: true }));
    pulseLoop.start(); rotateLoop.start();
    return () => { pulseLoop.stop(); rotateLoop.stop(); };
  }, [mode, pulse, rotate]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, mode === 'listening' ? 1.16 : 1.06] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.7] });
  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const icon = mode === 'listening' ? '⌁' : mode === 'thinking' ? '✦' : mode === 'speaking' ? '◖◗' : 'F';

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.halo, { opacity, transform: [{ scale }] }]} />
      <Animated.View style={[styles.ring, { transform: [{ rotate: spin }] }]}>
        <View style={styles.ringGap} />
      </Animated.View>
      <View style={styles.core}><Text style={styles.icon}>{icon}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 168, height: 168, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 132, height: 132, borderRadius: 66, backgroundColor: COLORS.primary2 },
  ring: { position: 'absolute', width: 148, height: 148, borderRadius: 74, borderWidth: 3, borderColor: COLORS.primary, borderTopColor: COLORS.primary2, borderRightColor: 'transparent' },
  ringGap: { flex: 1 },
  core: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: '#121735', borderWidth: 1, borderColor: 'rgba(255,255,255,.18)' },
  icon: { color: '#fff', fontSize: 34, fontWeight: '900', letterSpacing: 2 },
});
