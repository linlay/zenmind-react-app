import { Text, View } from 'react-native';

import { ScreenHeader, ScreenHeaderProps } from '../ScreenHeader';

const actionOne = <View />;
const actionTwo = <View />;
const actionThree = <View />;

const titleOnly = <ScreenHeader title="Workspace" />;

const oneLeftAction = <ScreenHeader title="Workspace" leftActions={[actionOne]} />;

const twoRightActions = <ScreenHeader title="Workspace" rightActions={[actionOne, actionTwo]} />;

const asymmetricalActions = (
  <ScreenHeader
    title={
      <View>
        <Text>Workspace</Text>
      </View>
    }
    leftActions={[actionOne, actionTwo]}
  />
);

const primitiveTitleProps: ScreenHeaderProps = {
  title: 42,
  rightActions: [],
  actionRailWidth: 112,
};

void [titleOnly, oneLeftAction, twoRightActions, asymmetricalActions, primitiveTitleProps];

const invalidLeftActions = (
  <ScreenHeader
    title="Workspace"
    leftActions={[
      actionOne,
      actionTwo,
      // @ts-expect-error ScreenHeader supports at most 2 left actions.
      actionThree,
    ]}
  />
);

const invalidRightActionsProps: ScreenHeaderProps = {
  title: 'Workspace',
  rightActions: [
    actionOne,
    actionTwo,
    // @ts-expect-error ScreenHeader supports at most 2 right actions.
    actionThree,
  ],
};

void [invalidLeftActions, invalidRightActionsProps];
