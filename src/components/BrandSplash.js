import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../theme';

export default function BrandSplash({ onDone }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.82)).current;
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }),
      Animated.loop(Animated.timing(ring, { toValue: 1, duration: 1800, easing: Easing.linear, useNativeDriver: true })),
    ]).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 320, useNativeDriver: true }).start(() => onDone?.());
    }, 1750);
    return () => clearTimeout(timer);
  }, [onDone, opacity, scale, ring]);

  const spin = ring.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={[styles.page, { opacity }]}> 
      <Animated.View style={[styles.logoWrap, { transform: [{ scale }] }]}> 
        <Animated.View style={[styles.ring, { transform: [{ rotate: spin }] }]} />
        <View style={styles.core}><Text style={styles.f}>F</Text></View>
      </Animated.View>
      <Text style={styles.name}>FARANGIS</Text>
      <Text style={styles.fa}>فرنگیس</Text>
      <Text style={styles.credit}>MADE BY SECTOR TEAM</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  page:{flex:1,backgroundColor:'#050714',alignItems:'center',justifyContent:'center'},
  logoWrap:{width:180,height:180,alignItems:'center',justifyContent:'center'},
  ring:{position:'absolute',width:168,height:168,borderRadius:84,borderWidth:4,borderColor:COLORS.primary,borderTopColor:COLORS.primary2,borderRightColor:'transparent'},
  core:{width:126,height:126,borderRadius:63,backgroundColor:'#111832',borderWidth:1,borderColor:'rgba(255,255,255,.16)',alignItems:'center',justifyContent:'center'},
  f:{color:'#fff',fontSize:48,fontWeight:'900',letterSpacing:3},
  name:{color:'#fff',fontSize:29,fontWeight:'900',letterSpacing:8,marginTop:22},
  fa:{color:'#AAB5D5',fontSize:15,fontWeight:'800',marginTop:7},
  credit:{color:'#5F698A',fontSize:7,fontWeight:'900',letterSpacing:2.8,marginTop:6},
});
