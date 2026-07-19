import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { fontWeight } from './feed/templates/tokens';

/**
 * The Witzy wordmark (React Native) — bold ink with the dot of the "i" rendered
 * as a bright SPARK (✦), the brand's "clever / aha" mark. The "i" is a dotless
 * "ı" with the spark overlaid where the dot would be (RN has no gradient text, so
 * the gradient lives in the ✦ logo badge alongside this).
 *
 * Accessibility: the row is one a11y node labelled "Witzy", so assistive tech and
 * tests read the brand as "Witzy" (query it with `getByLabelText('Witzy')`).
 */
export default function Wordmark({
  fontSize,
  color = '#ece4ff',
  style,
}: {
  fontSize: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const sparkSize = fontSize * 0.52;
  const letter = [styles.letter, { fontSize, color }];
  return (
    <View
      style={[styles.row, style]}
      accessible
      accessibilityRole="header"
      accessibilityLabel="Witzy"
    >
      <Text style={letter}>W</Text>
      <View>
        <Text style={letter}>ı</Text>
        <Text
          style={[styles.spark, { fontSize: sparkSize, top: -sparkSize * 0.5 }]}
        >
          ✦
        </Text>
      </View>
      <Text style={letter}>tzy</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  letter: {
    fontWeight: fontWeight.heavy,
    letterSpacing: -0.3,
  },
  spark: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#ff8ecb',
  },
});
