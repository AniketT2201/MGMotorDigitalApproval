import * as React from 'react';
import * as ReactDom from 'react-dom';
import { Version } from '@microsoft/sp-core-library';
import {
  type IPropertyPaneConfiguration,
  PropertyPaneTextField
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { IReadonlyTheme } from '@microsoft/sp-component-base';

import * as strings from 'MgDigitalApprovalWebPartStrings';
import { IMgDigitalApprovalProps } from './components/IMgDigitalApprovalProps';
import { ShiftApp } from './components/ShiftApp';
import { getEmployeeId } from './components/Services/BAL/MasterBAL';


export interface IMgDigitalApprovalWebPartProps {
  description: string;
}

export default class MgDigitalApprovalWebPart extends BaseClientSideWebPart<IMgDigitalApprovalWebPartProps> {

  private _isDarkTheme: boolean = false;
  private _environmentMessage: string = '';
  /** EmployeeId from the parent site's UserMaster list ('' if not found). */
  private _employeeId: string = '';
  private _employeeLookupError: string = '';

  /**
   * Props used everywhere in the app. Logged-in user details are defined HERE:
   * userId, userName, userEmail, userLoginName, employeeId.
   */
  private _buildProps(): IMgDigitalApprovalProps {
    const user = this.context.pageContext.user;
    const userId: number = this.context.pageContext.legacyPageContext.userId;
    return {
      description: this.properties.description,
      isDarkTheme: this._isDarkTheme,
      environmentMessage: this._environmentMessage,
      hasTeamsContext: !!this.context.sdks.microsoftTeams,
      userDisplayName: user.displayName,
      currentSPContext: this.context,
      context: this.context,
      id: userId,
      userId: userId,
      userName: user.displayName,
      userEmail: user.email,
      userLoginName: user.loginName,
      employeeId: this._employeeId,
      employeeLookupError: this._employeeLookupError
    };
  }

  public render(): void {
    const element: React.ReactElement<any> = React.createElement(ShiftApp, this._buildProps());

    ReactDom.render(element, this.domElement);
  }

  protected async onInit(): Promise<void> {
    this._environmentMessage = await this._getEnvironmentMessage();

    // EmployeeId comes from UserMaster on the PARENT site (matched on email).
    try {
      this._employeeId = await getEmployeeId(this._buildProps());
    } catch (error) {
      this._employeeId = '';
      this._employeeLookupError = (error as Error).message;
      console.error('Could not load the employee record from UserMaster.', error);
    }
  }



  private _getEnvironmentMessage(): Promise<string> {
    if (!!this.context.sdks.microsoftTeams) { // running in Teams, office.com or Outlook
      return this.context.sdks.microsoftTeams.teamsJs.app.getContext()
        .then(context => {
          let environmentMessage: string = '';
          switch (context.app.host.name) {
            case 'Office': // running in Office
              environmentMessage = this.context.isServedFromLocalhost ? strings.AppLocalEnvironmentOffice : strings.AppOfficeEnvironment;
              break;
            case 'Outlook': // running in Outlook
              environmentMessage = this.context.isServedFromLocalhost ? strings.AppLocalEnvironmentOutlook : strings.AppOutlookEnvironment;
              break;
            case 'Teams': // running in Teams
            case 'TeamsModern':
              environmentMessage = this.context.isServedFromLocalhost ? strings.AppLocalEnvironmentTeams : strings.AppTeamsTabEnvironment;
              break;
            default:
              environmentMessage = strings.UnknownEnvironment;
          }

          return environmentMessage;
        });
    }

    return Promise.resolve(this.context.isServedFromLocalhost ? strings.AppLocalEnvironmentSharePoint : strings.AppSharePointEnvironment);
  }

  protected onThemeChanged(currentTheme: IReadonlyTheme | undefined): void {
    if (!currentTheme) {
      return;
    }

    this._isDarkTheme = !!currentTheme.isInverted;
    const {
      semanticColors
    } = currentTheme;

    if (semanticColors) {
      this.domElement.style.setProperty('--bodyText', semanticColors.bodyText || null);
      this.domElement.style.setProperty('--link', semanticColors.link || null);
      this.domElement.style.setProperty('--linkHovered', semanticColors.linkHovered || null);
    }

  }

  protected onDispose(): void {
    ReactDom.unmountComponentAtNode(this.domElement);
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return {
      pages: [
        {
          header: {
            description: strings.PropertyPaneDescription
          },
          groups: [
            {
              groupName: strings.BasicGroupName,
              groupFields: [
                PropertyPaneTextField('description', {
                  label: strings.DescriptionFieldLabel
                })
              ]
            }
          ]
        }
      ]
    };
  }
}
