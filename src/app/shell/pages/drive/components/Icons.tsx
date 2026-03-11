import Svg, { Circle, Path, Rect } from 'react-native-svg';

export function FolderIcon({ color }: { color: string }) {
  return (
    <Svg width={25} height={25} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.7 8.8C3.7 7.53 4.73 6.5 6 6.5H9.3L10.9 8.1H17.6C18.87 8.1 19.9 9.13 19.9 10.4V16.5C19.9 17.77 18.87 18.8 17.6 18.8H6C4.73 18.8 3.7 17.77 3.7 16.5V8.8Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function ArchiveIcon({ color }: { color: string }) {
  return (
    <Svg width={25} height={25} viewBox="0 0 24 24" fill="none">
      <Rect x={5.1} y={7.6} width={13.8} height={10.9} rx={1.9} stroke={color} strokeWidth={1.8} />
      <Rect x={4.1} y={4.7} width={15.8} height={3.8} rx={1.3} stroke={color} strokeWidth={1.8} />
      <Path d="M12 10.5V14.6" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M10.2 14.6H13.8" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function FileIcon({ color }: { color: string }) {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8 3.9H13.9L18.3 8.3V18.4C18.3 19.5 17.4 20.4 16.3 20.4H8C6.9 20.4 6 19.5 6 18.4V5.9C6 4.8 6.9 3.9 8 3.9Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M13.8 3.9V8.4H18.3" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function MoreIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 20 20" fill="none">
      <Circle cx={10} cy={4.5} r={1.35} fill={color} />
      <Circle cx={10} cy={10} r={1.35} fill={color} />
      <Circle cx={10} cy={15.5} r={1.35} fill={color} />
    </Svg>
  );
}

export function CheckIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 20 20" fill="none">
      <Path
        d="M4.8 10.4L8.5 14L15.2 7.3"
        stroke={color}
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function UploadIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 16.2V6.4M12 6.4L8.4 10M12 6.4L15.6 10"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6.3 17V18.4C6.3 19.39 7.11 20.2 8.1 20.2H15.9C16.89 20.2 17.7 19.39 17.7 18.4V17"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function PlusIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 5.5V18.5M5.5 12H18.5"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </Svg>
  );
}
