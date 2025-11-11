// src/navigation/index.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Pantallas reales
import ProductList from '../screens/ProductList';
import ExpirySettingsScreen from '../screens/ExpirySettingsScreen';

// Si quieres usar tipos más estrictos en el futuro:
export type RootStackParamList = {
  ProductList: undefined;
  ExpirySettings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="ProductList"
          component={ProductList}
          options={{ title: 'Inventario' }}
        />
        <Stack.Screen
          name="ExpirySettings"
          component={ExpirySettingsScreen}
          options={{ title: 'Ajustes de vencimiento' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
