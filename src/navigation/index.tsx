// src/navigation/index.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TouchableOpacity, Text } from 'react-native';

import ProductList from '../screens/ProductList';
import AddProductScreen from '../screens/AddProductScreen';
import ExpirySettingsScreen from '../screens/ExpirySettingsScreen'; // 👈 NUEVA

export type RootStackParamList = {
  Products: undefined;
  AddProduct: undefined;
  ExpirySettings: undefined; // 👈 NUEVA RUTA
  // Movements: { productId: string; productName: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="Products"
          component={ProductList}
          options={({ navigation }) => ({
            title: 'Inventario',
            headerRight: () => (
              <TouchableOpacity
                onPress={() => navigation.navigate('ExpirySettings')}
                style={{ paddingHorizontal: 12 }}
              >
                <Text style={{ fontSize: 18 }}>⚙️</Text>
              </TouchableOpacity>
            ),
          })}
        />

        <Stack.Screen
          name="AddProduct"
          component={AddProductScreen}
          options={{ title: 'Nuevo producto' }}
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
