import './TempFileModal.css';

const React = window.React;

/**
 * 模态框状态类型
 */
export type ModalState = {
  /** 模态框是否可见 */
  visible: boolean;
  /** 模态框内容 */
  content: string;
  /** 文件名 */
  fileName: string;
};

/**
 * 临时文件模态框组件
 * 显示临时文件内容的模态对话框
 * @param props - 组件属性
 * @param props.state - 模态框状态
 * @param props.onClose - 关闭回调函数
 */
export const TempFileModal = ({
  state,
  onClose,
}: {
  state: ModalState;
  onClose: () => void;
}) => {
  // Lock body scroll when modal is visible
  React.useEffect(() => {
    if (state.visible) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [state.visible]);

  if (!state.visible) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title font-mono">{state.fileName}</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <pre className="modal-content">{state.content}</pre>
      </div>
    </div>
  );
};

/**
 * 模态框状态 Hook
 * 管理模态框的显示状态和操作
 * @returns 包含状态和操作方法的对象
 */
export const useModalState = () => {
  const [modalState, setModalState] = React.useState<ModalState>({
    visible: false,
    content: '',
    fileName: '',
  });

  const openModal = React.useCallback(
    (content: string, fileName: string = 'temp') => {
      setModalState({ visible: true, content, fileName });
    },
    [],
  );

  const closeModal = React.useCallback(() => {
    setModalState((prev) => ({ ...prev, visible: false }));
  }, []);

  return { modalState, openModal, closeModal };
};
