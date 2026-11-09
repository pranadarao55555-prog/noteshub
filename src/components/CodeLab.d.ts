import React from 'react';

export interface CodeLabProps {
  isOpen?: boolean;
  onClose: () => void;
  userId?: string | null;
}

declare const CodeLab: React.FC<CodeLabProps>;
export { CodeLab };
export default CodeLab;
