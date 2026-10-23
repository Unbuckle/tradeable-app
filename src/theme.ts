import { StyleSheet } from 'react-native';

/** tradeable. brand colours (nexustcg branding files). */
export const colors = {
  plum: '#2A2233',
  mauve: '#6D5A72',
  purple: '#8377D1',
  green: '#5EFC8D',
  text: '#FFFFFF',
  muted: '#C9BFCF',
  danger: '#FF7A7A',
};

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.plum },
  pad: { padding: 16, gap: 12 },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' },
  dot: { color: colors.green },
  text: { color: colors.text, fontSize: 16 },
  muted: { color: colors.muted, fontSize: 14 },
  error: { color: colors.danger, fontSize: 14 },
  input: {
    backgroundColor: '#3A3045',
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  button: { backgroundColor: colors.green, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: colors.plum, fontSize: 16, fontWeight: '700' },
  secondary: { backgroundColor: colors.purple },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chip: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#3A3045' },
  chipOn: { backgroundColor: colors.purple },
});
