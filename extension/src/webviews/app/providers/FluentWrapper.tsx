import {
  FluentProvider,
  webDarkTheme,
  webLightTheme,
  teamsHighContrastTheme,
  Theme
} from "@fluentui/react-components";
import { useEffect, useState } from "react";

export const FluentWrapper = ({ children }: { children: React.ReactNode }) => {
  const [currentTheme, setCurrentTheme] = useState<Theme>(webLightTheme);

  useEffect(() => {
    // Function to determine theme from VS Code body classes
    const updateTheme = () => {
      const body = document.body;
      if (body.classList.contains("vscode-high-contrast")) {
        setCurrentTheme(teamsHighContrastTheme);
      } else if (body.classList.contains("vscode-dark")) {
        setCurrentTheme(webDarkTheme);
      } else {
        setCurrentTheme(webLightTheme);
      }
    };

    // Initial check
    updateTheme();

    // Observe body class changes (VS Code toggles these on theme change)
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <FluentProvider theme={currentTheme} style={{ height: "100%", background: "transparent" }}>
      {children}
    </FluentProvider>
  );
};