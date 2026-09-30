jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text } = require('react-native');
  const MockIcon = ({ name, ...props }) => <Text {...props}>{name}</Text>;
  MockIcon.font = {};
  return { __esModule: true, default: MockIcon };
});

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const { Text } = require('react-native');
  const MockIcon = ({ name, ...props }) => <Text {...props}>{name}</Text>;
  MockIcon.font = {};
  return { __esModule: true, default: MockIcon };
});
