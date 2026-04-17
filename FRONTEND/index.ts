import { AppRegistry } from 'react-native';
import App from './App';
import { motionHeadlessTask } from '@/services/motion-background';

AppRegistry.registerComponent('RakshitArtha', () => App);
AppRegistry.registerHeadlessTask('MotionDetectionHeadlessTask', () => motionHeadlessTask);
