interface ScrollingTextProps {
  text: string;
  className?: string;
  containerWidth?: string;
  animationDuration?: string;
  animationDelay?: string;
}

export default function ScrollingText({ 
  text, 
  className = "", 
  containerWidth = "w-[278px]",
  animationDuration = "15s",
  animationDelay = "1s"
}: ScrollingTextProps) {
  return (
    <div 
      className={`${containerWidth} overflow-hidden relative`}
    >
      <div 
        className={`${className} whitespace-nowrap scroll-text`}
        style={{
          animationDuration,
          animationDelay
        }}
      >
        {text} • {text} • {text}
      </div>
    </div>
  );
}
