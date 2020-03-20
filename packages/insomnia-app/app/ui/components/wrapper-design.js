// @flow
import * as React from 'react';
import autobind from 'autobind-decorator';
import type { WrapperProps } from './wrapper';
import PageLayout from './page-layout';
import { Button, Breadcrumb, NoticeTable, Switch, Header } from 'insomnia-components';
import ErrorBoundary from './error-boundary';
import SpecEditorSidebar from './spec-editor/spec-editor-sidebar';
import CodeEditor from './codemirror/code-editor';
import { Spectral } from '@stoplight/spectral';
import { showModal } from './modals';
import GenerateConfigModal from './modals/generate-config-modal';
import classnames from 'classnames';
import SwaggerUI from 'swagger-ui-react';
import YAML from 'yaml';
import { ACTIVITY_HOME } from './activity-bar/activity-bar';
import type { ApiSpec } from '../../models/api-spec';
import designerLogo from '../images/insomnia-designer-logo.svg';
import previewIcon from '../images/icn-eye.svg';
import generateConfigIcon from '../images/icn-gear.svg';

const spectral = new Spectral();

type Props = {|
  gitSyncDropdown: React.Node,
  wrapperProps: WrapperProps,
  handleUpdateApiSpec: (s: ApiSpec) => any,
  handleSetDebugActivity: (s: ApiSpec) => any,
|};

type State = {|
  previewActive: boolean,
  lintMessages: Array<{
    message: string,
    line: number,
    type: 'error' | 'warning',
  }>,
|};

@autobind
class WrapperDesign extends React.PureComponent<Props, State> {
  editor: ?CodeEditor;
  debounceTimeout: IntervalID;

  state = {
    previewActive: true,
    lintMessages: [],
  };

  // Defining it here instead of in render() so it won't act as a changed prop
  // when being passed to <CodeEditor> again
  static lintOptions = {
    delay: 1000,
  };

  _setEditorRef(n: ?CodeEditor) {
    this.editor = n;
  }

  async _handleGenerateConfig() {
    const { activeApiSpec } = this.props.wrapperProps;
    showModal(GenerateConfigModal, { apiSpec: activeApiSpec });
  }

  _handleDebugSpec() {
    const { handleSetDebugActivity, wrapperProps: { activeApiSpec } } = this.props;
    handleSetDebugActivity(activeApiSpec);
  }

  _handleTogglePreview() {
    this.setState({ previewActive: !this.state.previewActive });
  }

  _handleOnChange(v: string) {
    const { wrapperProps: { activeApiSpec }, handleUpdateApiSpec } = this.props;

    // Debounce the update because these specs can get pretty large
    clearTimeout(this.debounceTimeout);
    this.debounceTimeout = setTimeout(async () => {
      await handleUpdateApiSpec({ ...activeApiSpec, contents: v });
    }, 500);
  }

  _handleSetSelection(chStart: number, chEnd: number, lineStart: number, lineEnd: number) {
    const editor = this.editor;

    if (!editor) {
      return;
    }

    editor.setSelection(chStart, chEnd, lineStart, lineEnd);
  }

  _handleLintClick(notice: {}) {
    const { start, end } = notice._range;
    this.setSelection(start.character, end.character, start.line, end.line);
  }

  async _reLint() {
    const { activeApiSpec } = this.props.wrapperProps;
    const results = await spectral.run(activeApiSpec.contents);

    this.setState({
      lintMessages: results.map(r => ({
        type: r.severity === 0 ? 'error' : 'warning',
        message: `${r.code} ${r.message}`,
        line: r.range.start.line,

        // Attach range that will be returned to our click handler
        _range: r.range,
      })),
    });
  }

  _handleBreadcrumb(index: number) {
    this.props.wrapperProps.handleSetActiveActivity(ACTIVITY_HOME);
  }

  componentDidMount() {
    this._reLint();
  }

  componentDidUpdate(prevProps: Props) {
    const { activeApiSpec } = this.props.wrapperProps;

    // Re-lint if content changed
    if (activeApiSpec.contents !== prevProps.wrapperProps.activeApiSpec.contents) {
      this._reLint();
    }
  }

  render() {
    const {
      gitSyncDropdown,
      wrapperProps,
    } = this.props;

    const {
      activeApiSpec,
      activeWorkspace,
      settings,
    } = wrapperProps;

    const {
      lintMessages,
      previewActive,
    } = this.state;

    let swaggerSpec;
    try {
      swaggerSpec = YAML.parse(activeApiSpec.contents) || {};
    } catch (err) {
      swaggerSpec = {};
    }

    return (
      <PageLayout
        wrapperProps={this.props.wrapperProps}
        renderPageHeader={() => (
          <Header
              className="app-header"
              gridLeft={
                  <React.Fragment>
                      <img src={designerLogo} alt="Insomnia" width="24" height="24" />
                      <Breadcrumb className="breadcrumb" crumbs={['Documents', activeWorkspace.name]} onClick={this._handleBreadcrumb} />
                  </React.Fragment>
              }
              gridCenter={
                  <Switch onClick={this._handleDebugSpec} optionItems={[{'label': 'DESIGN', 'selected': true}, {'label': 'DEBUG', 'selected': false}]} />
              }
              gridRight={
                  <React.Fragment>
                      <Button onClick={this._handleTogglePreview} className="btn-utility-reverse">
                      <img src={previewIcon} alt="Preview" width="15" />&nbsp; {previewActive ? 'Preview: On' : 'Preview: Off'}
                      </Button>
                      <Button onClick={this._handleGenerateConfig} className="margin-left btn-utility-reverse">
                      <img src={generateConfigIcon} alt="Generate Config" width="15" />&nbsp; Generate Config
                      </Button>
                      {gitSyncDropdown}
                  </React.Fragment>
              }
          />
        )}
        renderPageBody={() => (
          <div
            className={classnames('spec-editor layout-body--sidebar theme--pane', {
              'preview-hidden': !previewActive,
            })}>
            <div id="swagger-ui-wrapper">
              <SwaggerUI spec={swaggerSpec} />
            </div>
            <div className="spec-editor__body theme--pane__body">
              <CodeEditor
                manualPrettify
                ref={this._setEditorRef}
                fontSize={settings.editorFontSize}
                indentSize={settings.editorIndentSize}
                lineWrapping={settings.lineWrapping}
                keyMap={settings.editorKeyMap}
                lintOptions={WrapperDesign.lintOptions}
                mode="openapi"
                defaultValue={activeApiSpec.contents}
                onChange={this._handleOnChange}
                uniquenessKey={activeApiSpec._id}
              />
              {lintMessages.length > 0 && (
                <NoticeTable
                  notices={lintMessages}
                  onClick={this._handleLintClick}
                />
              )}
            </div>
          </div>
        )}
        renderPageSidebar={() => (
          <ErrorBoundary showAlert>
            <SpecEditorSidebar
              apiSpec={activeApiSpec}
              handleSetSelection={this._handleSetSelection}
            />
          </ErrorBoundary>
        )}
      />
    );
  }
}

export default WrapperDesign;
