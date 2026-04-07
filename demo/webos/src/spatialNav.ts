/**
 * Spatial navigation for webOS remote control
 * Uses simple left/right navigation within sections, up/down between sections
 */

export function initSpatialNav() {
  // Auto-focus first button on load
  const focusFirstElement = () => {
    const firstButton = document.querySelector(
      'button:not(:disabled)',
    ) as HTMLElement;
    if (firstButton) {
      firstButton.focus();
    }
  };

  // Get all focusable elements in DOM order
  const getFocusableElements = (): HTMLElement[] => {
    return Array.from(
      document.querySelectorAll('button:not(:disabled), a'),
    ) as HTMLElement[];
  };

  // Group elements by their fieldset parent
  const getElementsBySection = (elements: HTMLElement[]): HTMLElement[][] => {
    const sections: HTMLElement[][] = [];
    const sectionMap = new Map<Element | null, HTMLElement[]>();

    elements.forEach((el) => {
      const fieldset = el.closest('fieldset') || el.closest('.sessionInfo');
      if (!sectionMap.has(fieldset)) {
        sectionMap.set(fieldset, []);
      }
      sectionMap.get(fieldset)?.push(el);
    });

    // Convert to array of sections in DOM order
    const allSections = Array.from(
      document.querySelectorAll('fieldset, .sessionInfo'),
    );
    allSections.forEach((section) => {
      const elements = sectionMap.get(section);
      if (elements && elements.length > 0) {
        sections.push(elements);
      }
    });

    return sections;
  };

  // Enhanced keyboard handler for remote control
  const handleKeydown = (e: KeyboardEvent) => {
    const key = e.key;

    // Remote control arrow keys and Enter/Return
    if (
      !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(
        key,
      )
    ) {
      return;
    }

    const activeElement = document.activeElement as HTMLElement;

    // Handle Enter on focused element
    if (key === 'Enter' && activeElement) {
      e.preventDefault();
      activeElement.click();
      return;
    }

    const focusable = getFocusableElements();
    if (focusable.length === 0) return;

    const currentIndex = focusable.indexOf(activeElement);
    if (currentIndex === -1) {
      focusable[0]?.focus();
      return;
    }

    const sections = getElementsBySection(focusable);
    let currentSectionIndex = -1;
    let indexInSection = -1;

    // Find current section and position
    for (let i = 0; i < sections.length; i++) {
      const idx = sections[i].indexOf(activeElement);
      if (idx !== -1) {
        currentSectionIndex = i;
        indexInSection = idx;
        break;
      }
    }

    if (currentSectionIndex === -1) {
      focusable[0]?.focus();
      return;
    }

    let nextElement: HTMLElement | null = null;

    switch (key) {
      case 'ArrowLeft':
        // Previous element in same section
        if (indexInSection > 0) {
          nextElement = sections[currentSectionIndex][indexInSection - 1];
        } else {
          // Wrap to last element in section
          nextElement =
            sections[currentSectionIndex][
              sections[currentSectionIndex].length - 1
            ];
        }
        break;

      case 'ArrowRight':
        // Next element in same section
        if (indexInSection < sections[currentSectionIndex].length - 1) {
          nextElement = sections[currentSectionIndex][indexInSection + 1];
        } else {
          // Wrap to first element in section
          nextElement = sections[currentSectionIndex][0];
        }
        break;

      case 'ArrowUp':
        // Move to previous section, always select first item
        if (currentSectionIndex > 0) {
          const prevSection = sections[currentSectionIndex - 1];
          nextElement = prevSection[0];
        } else {
          // Wrap to last section
          const lastSection = sections[sections.length - 1];
          nextElement = lastSection[0];
        }
        break;

      case 'ArrowDown':
        // Move to next section, always select first item
        if (currentSectionIndex < sections.length - 1) {
          const nextSection = sections[currentSectionIndex + 1];
          nextElement = nextSection[0];
        } else {
          // Wrap to first section
          const firstSection = sections[0];
          nextElement = firstSection[0];
        }
        break;
    }

    if (nextElement) {
      e.preventDefault();
      nextElement.focus();

      // Ensure element is visible
      nextElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  };

  // Initialize
  document.addEventListener('keydown', handleKeydown);

  // Focus first element when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', focusFirstElement);
  } else {
    focusFirstElement();
  }

  // Return cleanup function
  return () => {
    document.removeEventListener('keydown', handleKeydown);
  };
}
