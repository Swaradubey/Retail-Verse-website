import React, { useState } from 'react';
import {
  X,
  Printer,
  Bluetooth,
  Settings,
  CheckCircle2,
  AlertCircle,
  Check,
  RotateCcw,
  Sliders,
  Store,
  Layers,
} from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { PrinterSettings, isBillPlusDevice } from '../../lib/thermalPrinter';

interface ThermalHardwareModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: PrinterSettings;
  onSaveSettings: (newSettings: Partial<PrinterSettings>) => void;
  isWebUsbSupported?: boolean;
  usbDevice?: USBDevice | null;
  onConnectUsb?: () => Promise<void>;
  onDisconnectUsb?: () => Promise<void>;
  isBluetoothSupported?: boolean;
  bluetoothDevice?: any;
  onConnectBluetooth?: () => Promise<void>;
  onDisconnectBluetooth?: () => Promise<void>;
  onTestPrintReceipt: () => Promise<void>;
  onTestPrintLabel: () => Promise<void>;
}

export const ThermalHardwareModal: React.FC<ThermalHardwareModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  isBluetoothSupported = true,
  bluetoothDevice,
  onConnectBluetooth,
  onDisconnectBluetooth,
  onTestPrintReceipt,
  onTestPrintLabel,
}) => {
  const [activeTab, setActiveTab] = useState<'hardware' | 'store'>('hardware');
  const [formSettings, setFormSettings] = useState<PrinterSettings>(settings);
  const [isConnectingBt, setIsConnectingBt] = useState(false);
  const [isPrintingTest, setIsPrintingTest] = useState(false);

  // Sync form state when settings prop updates
  React.useEffect(() => {
    const cleanSettings = { ...settings };
    if (cleanSettings.storeName === 'RETAILVERSE') {
      cleanSettings.storeName = '';
    }
    setFormSettings(cleanSettings);
  }, [settings]);

  if (!isOpen) return null;

  const handleSaveStoreInfo = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formSettings);
    toast.success('Thermal printer settings saved successfully');
  };

  const handleConnectBtClick = async () => {
    if (!onConnectBluetooth) return;
    setIsConnectingBt(true);
    try {
      await onConnectBluetooth();
    } finally {
      setIsConnectingBt(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-gradient-to-r from-violet-600 via-indigo-600 to-indigo-700 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Printer className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Thermal Hardware & Printer Settings
                <span className="text-[10px] font-semibold bg-white/20 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
                  POS Engine
                </span>
              </h3>
              <p className="text-xs text-indigo-100">
                Configure direct ESC/POS hardware, roll widths, and receipt layout
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 px-6 pt-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('hardware')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'hardware'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Bluetooth className="w-3.5 h-3.5" />
            Hardware & Connection
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('store')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'store'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            Receipt Layout & Header
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: HARDWARE & CONNECTION */}
          {activeTab === 'hardware' && (
            <div className="space-y-6">
              {/* Web Bluetooth Wireless Card */}
              <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/70 to-violet-50/50 dark:from-indigo-950/30 dark:to-violet-950/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        bluetoothDevice
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600'
                          : 'bg-indigo-600 text-white shadow-sm'
                      }`}
                    >
                      <Bluetooth className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                        Bluetooth Wireless Printer
                        <span className="text-[9px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/80 dark:text-indigo-300 px-1.5 py-0.2 rounded-full uppercase">
                          Recommended
                        </span>
                      </h4>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        1-Click wireless ESC/POS print for BillPlus, POS-58 & portable thermal printers
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {bluetoothDevice ? (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Connected ({bluetoothDevice.name || 'Bluetooth Printer'})
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-100/70 dark:bg-indigo-950/60 px-2 py-1 rounded-lg">
                        Wireless Ready
                      </span>
                    )}
                  </div>
                </div>

                {isBluetoothSupported ? (
                  <div className="flex items-center justify-between pt-1 border-t border-indigo-100 dark:border-indigo-900/40">
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {bluetoothDevice
                        ? 'Connected wirelessly! Bill prints will send directly without opening any dialog.'
                        : 'Connect BillPlus / portable thermal printer directly with 1 click.'}
                    </p>
                    {bluetoothDevice ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={onDisconnectBluetooth}
                        className="rounded-xl text-xs text-rose-600 hover:text-rose-700 border-rose-200 dark:border-rose-900"
                      >
                        Disconnect Bluetooth
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleConnectBtClick}
                        disabled={isConnectingBt}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold px-4 gap-1.5 shadow-sm"
                      >
                        <Bluetooth className="w-3.5 h-3.5" />
                        {isConnectingBt ? 'Searching...' : 'Pair Bluetooth Printer'}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      Web Bluetooth is available on Chrome, Edge, and Android Chrome. Please open in Chrome.
                    </div>
                  </div>
                )}
              </div>

              {/* Thermal Roll Profile Selection */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 uppercase tracking-wider">
                  <Sliders className="w-4 h-4 text-indigo-600" />
                  Thermal Roll Width & Profile
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      onSaveSettings({ rollWidth: '80mm' });
                      setFormSettings((prev) => ({ ...prev, rollWidth: '80mm' }));
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all relative ${
                      formSettings.rollWidth === '80mm'
                        ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/40 hover:bg-zinc-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-zinc-900 dark:text-white">
                          80mm Roll (Standard 3-Inch)
                        </span>
                        <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 px-1.5 py-0.5 rounded">
                          Recommended
                        </span>
                      </div>
                      {formSettings.rollWidth === '80mm' && (
                        <Check className="w-4 h-4 text-indigo-600" />
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Printable width 72mm. Perfect for standard busy retail counters, grocery stores & restaurants.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onSaveSettings({ rollWidth: '58mm' });
                      setFormSettings((prev) => ({ ...prev, rollWidth: '58mm' }));
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all relative ${
                      formSettings.rollWidth === '58mm'
                        ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/40 hover:bg-zinc-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-zinc-900 dark:text-white">
                          58mm Roll (Compact 2-Inch)
                        </span>
                      </div>
                      {formSettings.rollWidth === '58mm' && (
                        <Check className="w-4 h-4 text-indigo-600" />
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      Printable width 48mm. Condensed high-speed layout for mobile Bluetooth printers & compact POS stations.
                    </p>
                  </button>
                </div>
              </div>

              {/* Hardware Preferences */}
              <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/20 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-zinc-900 dark:text-white block">
                    Automatic Paper Cut (ESC/POS GS V)
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    Sends paper guillotine cut command at the end of each completed receipt
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={formSettings.autoCut}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setFormSettings((prev) => ({ ...prev, autoCut: checked }));
                    onSaveSettings({ autoCut: checked });
                  }}
                  className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                />
              </div>

              {/* Thermal Sticker Command Protocol */}
              <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/20 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-zinc-900 dark:text-white block">
                    Barcode Sticker Protocol
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    {isBillPlusDevice(bluetoothDevice) ? (
                      <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                        BillPlus printer detected — ESC/POS Raster mode recommended
                      </span>
                    ) : (
                      'TSPL for barcode label printers (TSC, Xprinter) · ESC/POS for receipt sticker rolls'
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setFormSettings((prev) => ({ ...prev, labelProtocol: 'tspl' }));
                      onSaveSettings({ labelProtocol: 'tspl' });
                    }}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                      (formSettings.labelProtocol || 'tspl') === 'tspl'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                    }`}
                  >
                    TSPL
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormSettings((prev) => ({ ...prev, labelProtocol: 'escpos' }));
                      onSaveSettings({ labelProtocol: 'escpos' });
                    }}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                      formSettings.labelProtocol === 'escpos'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
                    }`}
                  >
                    ESC/POS
                  </button>
                </div>
              </div>

              {/* Hardware Test Prints */}
              <div className="p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 space-y-3">
                <span className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5 uppercase tracking-wider">
                  <Printer className="w-4 h-4 text-indigo-600" />
                  Diagnostic Test Prints
                </span>
                <p className="text-[11px] text-zinc-500">
                  Verify print density, alignment, paper cut, and barcode scanability on your physical printer:
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      setIsPrintingTest(true);
                      try {
                        await onTestPrintReceipt();
                      } finally {
                        setIsPrintingTest(false);
                      }
                    }}
                    disabled={isPrintingTest}
                    className="rounded-xl text-xs font-semibold gap-1.5 border-zinc-300 dark:border-zinc-700"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Test Receipt ({formSettings.rollWidth})
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      setIsPrintingTest(true);
                      try {
                        await onTestPrintLabel();
                      } finally {
                        setIsPrintingTest(false);
                      }
                    }}
                    disabled={isPrintingTest}
                    className="rounded-xl text-xs font-semibold gap-1.5 border-zinc-300 dark:border-zinc-700"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Test Barcode Sticker (50×25mm)
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: STORE & HEADER CUSTOMIZATION */}
          {activeTab === 'store' && (
            <form onSubmit={handleSaveStoreInfo} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    Store / Company Name
                  </label>
                  <input
                    type="text"
                    value={formSettings.storeName}
                    onChange={(e) =>
                      setFormSettings({ ...formSettings, storeName: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g. My Store Name"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    Receipt Sub-title / Tax Invoice Tag
                  </label>
                  <input
                    type="text"
                    value={formSettings.storeTagline || ''}
                    onChange={(e) =>
                      setFormSettings({ ...formSettings, storeTagline: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="TAX INVOICE"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  Store Address
                </label>
                <input
                  type="text"
                  value={formSettings.storeAddress || ''}
                  onChange={(e) =>
                    setFormSettings({ ...formSettings, storeAddress: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Shop No. 4, Commercial Plaza, MG Road"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    Store Phone Number
                  </label>
                  <input
                    type="text"
                    value={formSettings.storePhone || ''}
                    onChange={(e) =>
                      setFormSettings({ ...formSettings, storePhone: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="+91 98765 43210"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                    GSTIN / Tax ID
                  </label>
                  <input
                    type="text"
                    value={formSettings.storeGstin || ''}
                    onChange={(e) =>
                      setFormSettings({ ...formSettings, storeGstin: e.target.value })
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="27AAAAA0000A1Z5"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                  Custom Receipt Footer Message
                </label>
                <textarea
                  rows={2}
                  value={formSettings.footerNote || ''}
                  onChange={(e) =>
                    setFormSettings({ ...formSettings, footerNote: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="THANK YOU FOR SHOPPING! VISIT AGAIN SOON"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold px-5"
                >
                  Save Store Details
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 flex items-center justify-between">
          <div className="text-xs text-zinc-500 flex items-center gap-2">
            <span className="font-medium">Active Engine:</span>
            {bluetoothDevice ? (
              <span className="text-indigo-600 dark:text-indigo-400 font-bold flex items-center gap-1">
                <Bluetooth className="w-3.5 h-3.5" /> Direct Bluetooth Wireless Binary
              </span>
            ) : (
              <span className="text-zinc-600 dark:text-zinc-400 font-bold">Standard Thermal Engine</span>
            )}
          </div>
          <Button
            type="button"
            onClick={onClose}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold px-5"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  );
};
