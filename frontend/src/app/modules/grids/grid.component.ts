import {Component, OnInit, AfterViewInit, ComponentFactoryResolver, ElementRef, ViewChild, ViewContainerRef,
  ComponentRef,
  OnDestroy,
  Input} from "@angular/core";
import {GridResource} from "app/modules/hal/resources/grid-resource";
import {GridWidgetResource} from "app/modules/hal/resources/grid-widget-resource";
import {HookService} from "app/modules/plugins/hook-service";
import {debugLog} from "app/helpers/debug_output";
import {DomSanitizer} from "@angular/platform-browser";
import {CdkDragDrop, CdkDragStart, CdkDragEnd} from "@angular/cdk/drag-drop";
import {ResizeDelta} from "../common/resizer/resizer.component";
import {GridWidgetsService} from "core-app/modules/grids/widgets/widgets.service";
import {AddGridWidgetService} from "core-app/modules/grids/widgets/add/add.service";

export interface WidgetRegistration {
  identifier:string;
  // TODO: Find out how to declare component to be of type class
  component:any;
}

export class GridArea implements GridArea {
  private storedGuid:string;
  public startRow:number;
  public endRow:number;
  public startColumn:number;
  public endColumn:number;

  constructor(startRow:number, endRow:number, startColumn:number, endColumn:number) {
    this.startRow = startRow;
    this.endRow = endRow;
    this.startColumn = startColumn;
    this.endColumn = endColumn;
  }

  public doesContain(otherArea:GridArea) {
    return this.isTopLeftInside(otherArea) ||
      this.isTopRightInside(otherArea) ||
      this.isBottomLeftInside(otherArea) ||
      this.isBottomRightInside(otherArea);
  }

  private isTopLeftInside(otherArea:GridArea) {
    return this.startRow <= otherArea.startRow && this.endRow > otherArea.startRow &&
      this.startColumn <= otherArea.startColumn && this.endColumn > otherArea.startColumn;
  }

  private isTopRightInside(otherArea:GridArea) {
    return this.startRow <= otherArea.startRow && this.endRow > otherArea.startRow &&
      this.startColumn < otherArea.endColumn && this.endColumn >= otherArea.endColumn;
  }

  private isBottomLeftInside(otherArea:GridArea) {
    return this.startRow <= otherArea.startRow && this.endRow > otherArea.startRow &&
      this.startColumn < otherArea.endColumn && this.endColumn >= otherArea.endColumn;
  }

  private isBottomRightInside(otherArea:GridArea) {
    return this.startRow < otherArea.endRow && this.endRow >= otherArea.endRow &&
      this.startColumn < otherArea.endColumn && this.endColumn >= otherArea.endColumn;
  }

  public get guid():string {
    if (!this.storedGuid) {
      this.storedGuid = this.newGuid();
    }

    return this.storedGuid;
  }

  private newGuid() {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
  }
}

export class GridWidgetArea extends GridArea {
  public widget:GridWidgetResource;

  constructor(widget:GridWidgetResource) {
    super(widget.startRow,
          widget.endRow,
          widget.startColumn,
          widget.endColumn);

    this.widget = widget;
  }
}

@Component({
  templateUrl: './grid.component.html',
  selector: 'grid'
})
export class GridComponent implements OnDestroy, OnInit {
  public uiWidgets:ComponentRef<any>[] = [];
  public widgetResources:GridWidgetResource[] = [];
  private numColumns:number = 0;
  private numRows:number = 0;
  public gridAreas:GridArea[];
  public gridWidgetAreas:GridWidgetArea[];
  public gridAreaDropIds:string[];
  public currentlyDragging = false;
  public GRID_AREA_HEIGHT = 400;

  public resizeArea:GridArea|null;
  private mousedOverArea:GridArea|null;

  @Input() grid:GridResource;

  constructor(readonly resolver:ComponentFactoryResolver,
              readonly Hook:HookService,
              private sanitization:DomSanitizer,
              private widgetsService:GridWidgetsService,
              private addService:AddGridWidgetService) {}

  ngOnDestroy() {
    this.uiWidgets.forEach((widget) => widget.destroy());
  }

  ngOnInit() {
    this.numRows = this.grid.rowCount;
    this.numColumns = this.grid.columnCount;

    this.widgetResources = this.grid.widgets;

    this.buildAreas();
  }

  public widgetComponent(widget:GridWidgetResource|null) {
    if (!widget) {
      return null;
    }

    let registration = this.widgetsService.registered.find((reg) => reg.identifier === widget.identifier);

    if (!registration) {
      debugLog(`No widget registered with identifier ${widget.identifier}`);

      return null;
    } else {
      return registration.component;
    }
  }

  public get gridColumnStyle() {
    return this.sanitization.bypassSecurityTrustStyle(`repeat(${this.numColumns}, 1fr)`);
  }

  public get gridRowStyle() {
    return this.sanitization.bypassSecurityTrustStyle(`repeat(${this.numRows}, ${this.GRID_AREA_HEIGHT}px)`);
  }

  public dragStart(event:CdkDragStart) {
    this.currentlyDragging = true;
  }

  public dragStop(event:CdkDragEnd) {
    this.currentlyDragging = false;
  }

  public drop(event:CdkDragDrop<GridArea>) {
    if (event.previousContainer !== event.container) {
      let widgetArea = event.previousContainer.data as GridWidgetArea;
      let widget = widgetArea.widget;
      let dropArea = event.container.data;

      widgetArea.startRow = dropArea.startRow;
      widgetArea.endRow = widgetArea.startRow + widget.height;
      widgetArea.startColumn = dropArea.startColumn;
      widgetArea.endColumn = widgetArea.startColumn + widget.width;

      this.moveAreasDown(widgetArea);
    }

    //this.buildAreas();
  }

  public resize(area:GridWidgetArea, deltas:ResizeDelta) {
    if (!this.resizeArea ||
        !this.mousedOverArea ||
        this.mousedOverArea === this.resizeArea) {
      return;
    }

    let widget = area.widget;

    widget.endRow = this.resizeArea.endRow;
    widget.endColumn = this.resizeArea.endColumn;

    this.buildAreas();

    return this.resizeArea = null;
  }

  public resizeStart(area:GridArea) {
    this.resizeArea = new GridArea(area.startRow,
                                   area.endRow,
                                   area.startColumn,
                                   area.endColumn);
  }

  public resizeMove(deltas:ResizeDelta) {
    if (!this.resizeArea ||
        !this.mousedOverArea ||
        this.mousedOverArea === this.resizeArea) {
      return;
    }

    this.resizeArea.endRow = this.mousedOverArea.endRow;
    this.resizeArea.endColumn = this.mousedOverArea.endColumn;
  }

  public isResizeTarget(area:GridArea) {
    if (!this.resizeArea) {
      return false;
    } else if (this.gridAreaDropIds.indexOf(this.gridAreaId(area)) >= 0) {
      return true;
    } else {
      return area.startRow >= this.resizeArea.startRow &&
             area.endRow <= this.resizeArea.endRow &&
             area.startColumn >= this.resizeArea.startColumn &&
             area.endColumn <= this.resizeArea.endColumn;
    }
  }

  public isAddable(area:GridArea) {
    return !this.currentlyDragging &&
             !this.currentlyResizing &&
             this.mousedOverArea === area &&
             this.gridAreaDropIds.includes(this.gridAreaId(area));
  }

  public get currentlyResizing() {
    return this.resizeArea;
  }

  public setMousedOverArea(area:GridArea) {
    this.mousedOverArea = area;
  }

  public gridAreaId(area:GridArea) {
    return `grid--area-${area.startRow}-${area.startColumn}`;
  }

  public addWidget(area:GridArea) {
    this
      .addService
      .select(area)
      .then((widgetResource) => {
        // TODO: We should use the proper resource here
        // but they are not casted as such when we get the
        // initial resources from the backend
        this.widgetResources.push(widgetResource);

        this.buildAreas();
      });
  }

  public removeWidget(area:GridWidgetArea) {
    let removedWidget = area.widget;

    this.widgetResources = this.widgetResources.filter((widget) => {
      return widget.identifier !== removedWidget.identifier ||
        widget.startColumn !== removedWidget.startColumn ||
        widget.endColumn !== removedWidget.endColumn ||
        widget.startRow !== removedWidget.startRow ||
        widget.endRow !== removedWidget.endRow;
    });

    this.buildAreas();
  }

  private buildAreas() {
    this.gridAreas = this.buildGridAreas();
    this.gridAreaDropIds = this.buildGridAreaDropIds();
    this.gridWidgetAreas = this.buildGridWidgetAreas();
  }

  private buildGridAreas() {
    let cells:GridArea[] = [];

    for (let row = 1; row <= this.numRows; row++) {
      for (let column = 1; column <= this.numColumns; column++) {
        let cell = new GridArea(row,
                                row + 1,
                                column,
                                column + 1);

        cells.push(cell);
      }
    }

    return cells;
  }

  private buildGridWidgetAreas() {
    return this.widgetResources.map((widget) => {
      return new GridWidgetArea(widget);
    });
  }

  private widgetOfArea(row:number, column:number) {
    return this.widgetResources.find((resource) => resource.startRow === row && resource.startColumn === column);
  }

  public identifyGridCellItem(index:number, cell:GridArea) {
    return `gridItem ${cell.startRow}/${cell.endColumn}`;
  }

  private buildGridAreaDropIds() {
    let ids:string[] = [];

    //this.gridAreas.filter((area) => {
    //  return !this.widgetResources.find((resource) => {
    //    return resource.startRow <= area.startRow &&
    //      resource.endRow >= area.endRow &&
    //      resource.startColumn <= area.startColumn &&
    //      resource.endColumn >= area.endColumn;
    //  });
    this.gridAreas.forEach((area) => {
      ids.push(this.gridAreaId(area as GridArea));
    });

    return ids;
  }

  private doAreasOverlap(area:GridArea, otherArea:GridArea) {
    return area.doesContain(otherArea) ||
             otherArea.doesContain(area);
  }

  private moveAreasDown(movedArea:GridWidgetArea|null) {
    let movedAreas:GridWidgetArea[] = [];
    let remainingAreas:GridWidgetArea[] = this.gridWidgetAreas.slice(0).sort((a, b) => {
      return b.startRow - a.startRow;
    });

    while (movedArea !== null) {
      movedAreas.push(movedArea!);

      remainingAreas = remainingAreas.filter((area) => {
        return area.guid !== movedArea!.guid;
      });

      movedArea = this.moveOneAreaDown(movedAreas, remainingAreas);
    }
  }

  private moveOneAreaDown(anchorAreas:GridWidgetArea[], movableAreas:GridWidgetArea[]) {
    let moveSpecification = this.firstAreaToMove(anchorAreas, movableAreas);

    if (moveSpecification) {
      let toMoveArea = moveSpecification[0] as GridWidgetArea;
      let anchorArea = moveSpecification[1] as GridWidgetArea;

      let areaHeight = toMoveArea.widget.height;

      toMoveArea.startRow = anchorArea.endRow;
      toMoveArea.endRow = toMoveArea.startRow + areaHeight;

      if (this.numRows < toMoveArea.endRow - 1) {
        this.numRows = toMoveArea.endRow - 1;
      }

      return toMoveArea;
    } else {
      return null;
    }
  }

  // Return first area that needs to move as it overlaps another area.
  // There are two groups of areas here. The first (anchorAreas) is considered stable
  // and as such not fit for being moved. This happens e.g. when the user explicitly
  // moved a widget or if the area has already been moved in a previous run of this method.
  // The second group (movableAreas) consists of all areas that are movable.
  // Once an area out of the second group has been identified that overlaps an area of the first
  // group, the appropriate reference area for later moving is selected out of the group of all
  // unmovable areas. The reference area is the bottommost area within the unmovable areas which's
  // column values (start/end) include the to move area's start column value and which's end row is larger
  // than the area overlapping the area to move. Unmovable areas which's column values do not include the
  // start column are to the left or right of the area to move and can thus be ignored.
  private firstAreaToMove(anchorAreas:GridArea[], movableAreas:GridArea[]) {
    let overlappingArea:GridArea|null = null;
    let toMoveArea:GridArea|null = null;

    movableAreas.forEach((movableArea) => {
      anchorAreas.forEach((anchorArea) => {
        if (this.doAreasOverlap(anchorArea, movableArea)) {
          overlappingArea = anchorArea;
          toMoveArea = movableArea;
          return;
        }
      });

      if (toMoveArea) {
        return;
      }
    });

    if (toMoveArea !== null) {
      let referenceArea = overlappingArea!;

      anchorAreas.forEach((anchorArea) => {
        if (anchorArea.endRow > referenceArea.endRow &&
            toMoveArea!.startColumn >= anchorArea.startColumn && toMoveArea!.startColumn < anchorArea.endColumn) {
          referenceArea = anchorArea;
        }
      });

      return [toMoveArea, referenceArea];
    } else {
      return null;
    }
  }

}