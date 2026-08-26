import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';

import * as Contacts from 'expo-contacts';
import * as MediaLibrary from 'expo-media-library';
import * as Location from 'expo-location';
import { useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import { Audio } from 'expo-av';

export default function App() {
  const [status, setStatus] = useState({});
  const [, requestCameraPermission] = useCameraPermissions();
  const [result, setResult] = useState('Farangis Bridge is ready.');

  const setAccess = (name, value) => {
    setStatus((old) => ({ ...old, [name]: value }));
  };

  const testContacts = async () => {
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        setAccess('Contacts', 'denied');
        setResult('Contacts permission denied.');
        return;
      }

      const response = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Name,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
          Contacts.Fields.Birthday,
        ],
      });

      const contacts = response.data || [];
      const birthdays = contacts.filter((item) => item.birthday);

      setAccess('Contacts', 'granted');
      setResult(`Contacts: ${contacts.length}\nBirthdays: ${birthdays.length}`);
    } catch (error) {
      setResult(`Contacts Error:\n${String(error)}`);
    }
  };

  const testPhotos = async () => {
    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        setAccess('Photos', 'denied');
        setResult('Photos permission denied.');
        return;
      }

      const assets = await MediaLibrary.getAssetsAsync({ first: 20 });
      setAccess('Photos', 'granted');
      setResult(`Photos access OK.\nAssets: ${assets.totalCount}`);
    } catch (error) {
      setResult(`Photos Error:\n${String(error)}`);
    }
  };

  const testLocation = async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setAccess('Location', 'denied');
        setResult('Location permission denied.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setAccess('Location', 'granted');
      setResult(
        `Latitude: ${location.coords.latitude}\nLongitude: ${location.coords.longitude}`
      );
    } catch (error) {
      setResult(`Location Error:\n${String(error)}`);
    }
  };

  const testCamera = async () => {
    try {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        setAccess('Camera', 'denied');
        setResult('Camera permission denied.');
        return;
      }

      setAccess('Camera', 'granted');
      setResult('Camera access OK.');
    } catch (error) {
      setResult(`Camera Error:\n${String(error)}`);
    }
  };

  const testMicrophone = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        setAccess('Microphone', 'denied');
        setResult('Microphone permission denied.');
        return;
      }

      setAccess('Microphone', 'granted');
      setResult('Microphone access OK.');
    } catch (error) {
      setResult(`Microphone Error:\n${String(error)}`);
    }
  };

  const testClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      setAccess('Clipboard', 'granted');
      setResult(text ? `Clipboard:\n${text}` : 'Clipboard access OK.');
    } catch (error) {
      setResult(`Clipboard Error:\n${String(error)}`);
    }
  };

  const testSecureStore = async () => {
    try {
      await SecureStore.setItemAsync('farangis_test', 'OK');
      const value = await SecureStore.getItemAsync('farangis_test');
      setAccess('SecureStore', 'granted');
      setResult(`Secure Store: ${value}`);
    } catch (error) {
      setResult(`SecureStore Error:\n${String(error)}`);
    }
  };

  const items = [
    ['Contacts', '👥 Contacts', testContacts],
    ['Photos', '🖼 Photos & Videos', testPhotos],
    ['Location', '📍 Location', testLocation],
    ['Camera', '📷 Camera', testCamera],
    ['Microphone', '🎙 Microphone', testMicrophone],
    ['Clipboard', '📋 Clipboard', testClipboard],
    ['SecureStore', '🔐 Secure Store', testSecureStore],
  ];

  const icon = (name) => {
    if (status[name] === 'granted') return '✅';
    if (status[name] === 'denied') return '❌';
    return '⚪️';
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.logo}>🧠</Text>
      <Text style={styles.title}>Farangis Bridge</Text>
      <Text style={styles.subtitle}>Personal AI Permission Hub</Text>

      <View style={styles.card}>
        {items.map(([id, title, action]) => (
          <Pressable key={id} style={styles.button} onPress={action}>
            <Text style={styles.buttonText}>{icon(id)} {title}</Text>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.resultBox}>
        <Text style={styles.resultTitle}>Farangis Output</Text>
        <Text selectable style={styles.resultText}>{result}</Text>
      </View>

      <Pressable
        style={styles.helpButton}
        onPress={() => Alert.alert('Farangis Bridge', 'All permissions are requested only when you tap their test button.')}
      >
        <Text style={styles.helpButtonText}>Permission info</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#0B0D12',
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 18,
    paddingBottom: 80,
  },
  logo: {
    textAlign: 'center',
    fontSize: 52,
  },
  title: {
    color: '#FFFFFF',
    textAlign: 'center',
    fontSize: 29,
    fontWeight: '800',
    marginTop: 8,
  },
  subtitle: {
    color: '#8D96A8',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 25,
  },
  card: {
    backgroundColor: '#151922',
    borderRadius: 22,
    overflow: 'hidden',
  },
  button: {
    minHeight: 66,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#252A35',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  arrow: {
    color: '#697386',
    fontSize: 30,
  },
  resultBox: {
    backgroundColor: '#151922',
    borderRadius: 22,
    padding: 18,
    marginTop: 20,
  },
  resultTitle: {
    color: '#8D96A8',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
  },
  resultText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 25,
  },
  helpButton: {
    marginTop: 16,
    backgroundColor: '#232936',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  helpButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
