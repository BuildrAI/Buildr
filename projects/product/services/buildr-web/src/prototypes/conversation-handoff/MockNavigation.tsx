import {HomeOutlined,UnorderedListOutlined} from '@ant-design/icons';
import {AppNavigationItem} from '../../app/AppNavigationItem';
/** Only the navigation's data and destinations are mocked; the product rail is reused. */
export function AppNavigation(){return <nav className="shell-navigation"><AppNavigationItem name="overview" label="概览" icon={<HomeOutlined/>} to="/overview" path="/overview" active={false} onClick={event=>event.preventDefault()}/><AppNavigationItem name="tasks" label="任务" icon={<UnorderedListOutlined/>} to="/tasks/demo" path="/tasks/demo" active onClick={event=>event.preventDefault()}/></nav>;}
