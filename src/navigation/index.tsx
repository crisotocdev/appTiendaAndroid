// src/navigation/index.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ProductList from '../screens/ProductList';
import AddProductScreen from '../screens/AddProductScreen';
// (opcional) si tienes MovementsScreen, lo puedes sumar luego
// import MovementsScreen from '../screens/MovementsScreen';

export type RootStackParamList = {
  Products: undefined;
  AddProduct: undefined;
  // Movements: { productId: string; productName: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function Navigation() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Products" component={ProductList} options={{ title: 'Inventario' }} />
        <Stack.Screen name="AddProduct" component={AddProductScreen} options={{ title: 'Nuevo producto' }} />
        {/* <Stack.Screen name="Movements" component={MovementsScreen} options={{ title: 'Historial' }} /> */}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
