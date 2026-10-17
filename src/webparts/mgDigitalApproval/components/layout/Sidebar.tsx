import * as React from 'react';
import '../styles/common.scss';
import { NAV_ITEMS, PageId } from '../utils/constants';
import MGStoreLogo from "../../assets/MG-Motor-Logo.png";

/* -------------------------------- sidebar ------------------------------- */

export interface ISidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

export const Sidebar: React.FC<ISidebarProps> = (props) => (
  <aside className="sidebar">
    <div className="brand">
      <img
        src={MGStoreLogo}
        alt="MG Store Logo"
        className="h-9 w-9 rounded-full object-contain"
      />
      <span className="brand-full">JSW MGI</span>
      <span className="brand-short">JSW MGI</span>
      <small>Centralized Approval &amp; Note Management</small>
    </div>
    <div className="nav">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          className={item.id === props.activePage ? 'active' : ''}
          title={item.label}
          onClick={(): void => props.onNavigate(item.id)}
        >
          <span className="nav-icon">{item.icon}</span>
          <span className="nav-label">&nbsp; {item.label}</span>
        </button>
      ))}
    </div>
  </aside>
);

/* ------------------------------- top header ------------------------------ */

export interface ITopBarProps {
  title: string;
}

/** Header shows the page heading only. */
export const TopBar: React.FC<ITopBarProps> = (props) => (
  <header className="top">
    <h1>{props.title}</h1>
  </header>
);
